-- 用户表
CREATE TABLE cron_twitter_users (
  id SERIAL PRIMARY KEY,
  screen_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_image_url TEXT,
  description TEXT,
  followers_count INTEGER,
  friends_count INTEGER,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 推文表，images和videos直接存为JSON数组
CREATE TABLE cron_twitter_tweets (
  id SERIAL PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES cron_twitter_users(id) ON DELETE CASCADE,
  tweet_url TEXT NOT NULL,
  full_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  images JSONB DEFAULT '[]'::JSONB,  -- 使用JSONB数组存储图片URL
  videos JSONB DEFAULT '[]'::JSONB,  -- 使用JSONB数组存储视频URL
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);