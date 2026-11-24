BEGIN IMMEDIATE;
CREATE TABLE saved_topics(
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  PRIMARY KEY(account, topic)
);
PRAGMA user_version=12;
COMMIT;
