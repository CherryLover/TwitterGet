-- 推文表，images和videos直接存为JSON数组
CREATE TABLE cron_twitter_tweets (
  id SERIAL PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES cron_twitter_users_ext(rest_id) ON DELETE CASCADE, -- 使用rest_id作为用户标识符
  tweet_url TEXT NOT NULL,
  full_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  images JSONB DEFAULT '[]'::JSONB,  -- 使用JSONB数组存储图片URL
  videos JSONB DEFAULT '[]'::JSONB,  -- 使用JSONB数组存储视频URL
  content_type TEXT DEFAULT 'unknown', -- 内容类型：post, ai_draw, unknown等
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户表，包含完整信息但重点关注特定字段
CREATE TABLE cron_twitter_users_ext (
  id SERIAL PRIMARY KEY,
  rest_id TEXT NOT NULL UNIQUE,       -- Twitter API 返回的用户唯一标识
  name TEXT NOT NULL,                 -- 用户显示名称
  avatar TEXT,                        -- 头像URL（对应profile_image_url）
  
  -- 关键统计数据
  followers_count INTEGER DEFAULT 0,  -- 被关注数
  following_count INTEGER DEFAULT 0,  -- 关注数
  tweets_count INTEGER DEFAULT 0,     -- 帖子数量
  
  -- 其他重要信息
  screen_name TEXT,                   -- 用户名（@后面的名称）
  description TEXT,                   -- 个人简介
  location TEXT,                      -- 地理位置
  
  -- 原始数据
  raw_data JSONB,                     -- 存储完整的用户JSON数据

  profile_url TEXT,                   -- 用户个人主页URL
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- 记录创建时间
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()     -- 记录更新时间
);