/**
 * Redis Lua scripts for atomic letter mutations (§COR-01).
 * All read-decide-write mutations on letters run in a single atomic script.
 */

export const OPEN_LETTER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return nil
end

local letter = cjson.decode(raw)

if letter.openedAt == nil then
  letter.openedAt = tonumber(ARGV[1])
  
  if letter.burnAfterReading then
    letter.burnAt = tonumber(ARGV[1]) + tonumber(ARGV[2])
    local burnTtl = math.ceil(tonumber(ARGV[2]) / 1000)
    redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', burnTtl)
  else
    redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', tonumber(ARGV[3]))
  end

  local unread = tonumber(redis.call('GET', KEYS[2]) or '0')
  if unread > 0 then
    redis.call('DECR', KEYS[2])
  end
end

return cjson.encode(letter)
`;

export const SOLVE_RIDDLE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = "NOT_FOUND" })
end

local letter = cjson.decode(raw)

if letter.lock == nil or letter.lock.kind ~= "riddle" then
  return cjson.encode({ status = "NOT_A_RIDDLE", body = letter.body })
end

if letter.lock.solvedAt ~= nil then
  return cjson.encode({ status = "ALREADY_SOLVED", body = letter.body })
end

if letter.lock.attempts >= tonumber(ARGV[3]) then
  return cjson.encode({ status = "ATTEMPTS_EXCEEDED" })
end

if letter.lock.answerHash ~= ARGV[1] then
  letter.lock.attempts = letter.lock.attempts + 1
  local attemptsRemaining = tonumber(ARGV[3]) - letter.lock.attempts
  
  local ttl = tonumber(ARGV[5])
  if letter.burnAfterReading and letter.burnAt ~= nil then
    local diff = math.ceil((letter.burnAt - tonumber(ARGV[2])) / 1000)
    if diff > 1 then ttl = diff else ttl = 1 end
  end
  redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', ttl)
  
  if attemptsRemaining <= 0 then
    return cjson.encode({ status = "ATTEMPTS_EXCEEDED" })
  else
    return cjson.encode({ status = "WRONG_ANSWER", attemptsRemaining = attemptsRemaining })
  end
end

-- Answer matches!
letter.lock.solvedAt = tonumber(ARGV[2])

if letter.openedAt == nil then
  letter.openedAt = tonumber(ARGV[2])
  if letter.burnAfterReading then
    letter.burnAt = tonumber(ARGV[2]) + tonumber(ARGV[4])
  end
  local unread = tonumber(redis.call('GET', KEYS[2]) or '0')
  if unread > 0 then
    redis.call('DECR', KEYS[2])
  end
end

local ttl = tonumber(ARGV[5])
if letter.burnAfterReading and letter.burnAt ~= nil then
  local diff = math.ceil((letter.burnAt - tonumber(ARGV[2])) / 1000)
  if diff > 1 then ttl = diff else ttl = 1 end
end
redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', ttl)

return cjson.encode({ status = "SOLVED", body = letter.body })
`;

export const SET_REACTION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end

local letter = cjson.decode(raw)
if letter.reaction ~= nil then
  return 2
end

letter.reaction = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', tonumber(ARGV[2]))
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
return 1
`;

export const DELETE_LETTER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  local letter = cjson.decode(raw)
  if letter.openedAt == nil then
    local unread = tonumber(redis.call('GET', KEYS[3]) or '0')
    if unread > 0 then
      redis.call('DECR', KEYS[3])
    end
  end
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[4])
end

redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

export const DELIVER_BOTTLE_SCRIPT = `
-- KEYS[1]: bottle pair key (bottle:pair:{senderHash}:{recipient})
-- KEYS[2]: letter key (ltr:{id})
-- KEYS[3]: mailbox letters zset (mb:ltrs:{recipient})
-- KEYS[4]: mailbox unread counter (mb:unread:{recipient})
-- ARGV[1]: letterRecord JSON
-- ARGV[2]: letterId
-- ARGV[3]: score (now)
-- ARGV[4]: ttlSeconds

local pairAcquired = redis.call('SET', KEYS[1], '1', 'NX', 'EX', 86400)
if not pairAcquired then
  return 0
end

redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[4]))
redis.call('ZADD', KEYS[3], tonumber(ARGV[3]), ARGV[2])
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[4]))
redis.call('INCR', KEYS[4])

return 1
`;

export const EXTEND_MAILBOX_SCRIPT = `
-- Atomically extends a mailbox's expiry and refreshes every mailbox-scoped
-- key's TTL. The extensionsUsed counter is claimed inside the script, so
-- concurrent requests can never push a mailbox past its lifetime limit.
--
-- KEYS[1]: mailbox record (mb:{u})
-- KEYS[2]: mailbox letters zset (mb:ltrs:{u})
-- KEYS[3]: unread counter (mb:unread:{u})
-- KEYS[4]: recovery passcode hash (mb:recover:{u})
-- KEYS[5]: username reservation lock (mb:name:{u})
-- KEYS[6]: bottle pool "any"
-- KEYS[7]: bottle pool for the mailbox's gender (or "any" again)
-- ARGV[1]: addSeconds (extension length)
-- ARGV[2]: maxLifetimeSeconds (platform ceiling from creation)
-- ARGV[3]: maxExtensions (lifetime cap)
-- ARGV[4]: nowMs
-- ARGV[5]: letter key prefix (e.g. "ltr:")
-- ARGV[6]: graceSeconds (extra TTL for recovery/reservation keys)

local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = "NOT_FOUND" })
end

local mb = cjson.decode(raw)

if mb.isPermanent == true then
  return cjson.encode({ status = "PERMANENT" })
end

local now = tonumber(ARGV[4])
if tonumber(mb.expiresAt) <= now then
  return cjson.encode({ status = "EXPIRED" })
end

local used = tonumber(mb.extensionsUsed) or 0
if used >= tonumber(ARGV[3]) then
  return cjson.encode({ status = "EXTENSIONS_EXHAUSTED" })
end

local maxExpiresAt = tonumber(mb.createdAt) + tonumber(ARGV[2]) * 1000
local newExpiresAt = math.min(tonumber(mb.expiresAt) + tonumber(ARGV[1]) * 1000, maxExpiresAt)
if newExpiresAt <= tonumber(mb.expiresAt) then
  return cjson.encode({ status = "MAX_EXPIRY_REACHED" })
end

mb.expiresAt = newExpiresAt
mb.extensionsUsed = used + 1

local ttl = math.max(1, math.ceil((newExpiresAt - now) / 1000))
redis.call('SET', KEYS[1], cjson.encode(mb), 'EX', ttl)
redis.call('EXPIRE', KEYS[2], ttl)
redis.call('EXPIRE', KEYS[3], ttl)
redis.call('EXPIRE', KEYS[4], ttl + tonumber(ARGV[6]))
redis.call('EXPIRE', KEYS[5], ttl + tonumber(ARGV[6]))

-- Keep bottle-pool expiry scores in sync, but only for pools that still list
-- the mailbox (a user who disabled bottles must NOT be re-added).
for i = 6, 7 do
  if redis.call('ZSCORE', KEYS[i], mb.usernameLower) then
    redis.call('ZADD', KEYS[i], newExpiresAt, mb.usernameLower)
  end
end

-- Extend every letter's TTL to the new remaining lifetime, but never past a
-- burn deadline: burn-after-reading letters must die on schedule.
local ids = redis.call('ZRANGE', KEYS[2], 0, -1)
for _, id in ipairs(ids) do
  local lraw = redis.call('GET', ARGV[5] .. id)
  if lraw then
    local letter = cjson.decode(lraw)
    local lttl = ttl
    if type(letter.burnAt) == "number" and letter.burnAt > now then
      local bdiff = math.ceil((letter.burnAt - now) / 1000)
      if bdiff < lttl then lttl = bdiff end
    end
    if lttl > 0 then
      redis.call('EXPIRE', ARGV[5] .. id, lttl)
    end
  end
end

return cjson.encode({ status = "OK", expiresAt = newExpiresAt, extensionsUsed = used + 1 })
`;
