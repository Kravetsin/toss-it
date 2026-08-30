-- Flip the bot's chat replies ON for every channel that exists: the off-default made "why is the
-- bot silent" the single most-asked setup question. New channels get true at insert instead of via
-- a column default — see the chatBotReplies note in schema.ts. Anyone who truly wants a silent bot
-- turns the switch back off; before this, that set was indistinguishable from everyone who never
-- found the switch.
UPDATE `channels` SET `chat_bot_replies` = 1;
