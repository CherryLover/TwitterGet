import type { TweetApiUtilsData } from "twitter-openapi-typescript";
import * as i from "twitter-openapi-typescript-generated";
import { XAuthClient } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 获取Supabase凭证
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少SUPABASE_URL或SUPABASE_ANON_KEY环境变量');
  process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

// 读取开发者账号文件
const devAccounts = JSON.parse(fs.readFileSync("dev-accounts.json", "utf-8"));
const client = await XAuthClient();

// 统计计数器
const stats = {
  usersAdded: 0,
  usersUpdated: 0,
  tweetsAdded: 0,
  errors: 0
};

// 添加调试函数
function debugObject(obj: any, label: string) {
  console.log(`=== DEBUG ${label} ===`);
  try {
    //console.log(JSON.stringify(obj, null, 2).substring(0, 500) + "...");
    // 将对象保存为临时JSON文件
    const debugFilePath = `./debug/${label}-${Date.now()}.json`;
    fs.ensureDirSync('./debug');
    fs.writeFileSync(
      debugFilePath,
      JSON.stringify(obj, null, 2)
    );
    console.log(`调试对象已保存到: ${debugFilePath}`);
  } catch (error) {
    console.log("无法序列化对象:", error);
  }
  console.log(`=== END DEBUG ${label} ===`);
}

// 1. 遍历用户并处理推文
async function processAllUsers() {
  for (const account of devAccounts) {
    try {
      console.log(`获取用户 ${account.username} (ID: ${account.id}) 的推文`);
      
      // 获取推文
      const tweets = await getUserTweets(account.id, account.username);
      
      // 过滤推文
      const filteredTweets = filterTweets(tweets);
      
      // 处理每条推文
      for (const tweet of filteredTweets) {
        await processTweet(tweet);
      }
    } catch (error) {
      console.error(`获取用户 ${account.username} 的推文时出错:`, error);
      stats.errors++;
    }
  }
  
  printStats();
}

// 2. 获取用户推文
async function getUserTweets(userId: string, username: string) {
  const resp = await client.getTweetApi().getUserTweets({
    userId: userId
  });
  
  console.log(`用户 ${username} 的推文API调用已完成`);
  console.log(`找到 ${resp.data.data.length} 条推文`);
  
  if (resp.data.data.length > 0) {
    debugObject(resp.data.data[0], "第一条推文结构");
  }
  
  return resp.data.data;
}

// 3. 过滤推文
function filterTweets(tweets: any[]) {
  // 过滤掉推广内容
  const filteredTweets = tweets.filter((tweet) => !tweet.promotedMetadata);
  console.log(`过滤后剩余 ${filteredTweets.length} 条推文`);
  return filteredTweets;
}

// 4. 处理单条推文
async function processTweet(tweet: any) {
  try {
    // 尝试获取推文内容，根据两种可能的路径
    const screenName = get(tweet, "user.legacy.screenName");
    const fullText = 
      get(tweet, "raw.result.legacy.fullText") || 
      get(tweet, "tweet.legacy.fullText");
      
    const createdAt = 
      get(tweet, "raw.result.legacy.createdAt") || 
      get(tweet, "tweet.legacy.createdAt");
    
    console.log(`处理推文: ${screenName ? screenName : '未知用户'} - ${fullText ? fullText.substring(0, 50) : '无文本'}`);
    
    // 如果超过30天的推文，跳过
    if (createdAt && dayjs().diff(dayjs(createdAt), "day") > 30) {
      console.log("跳过超过30天的推文");
      return;
    }

    // 如果推文是转发，跳过
    if (get(tweet, "raw.result.legacy.isRetweet")) {
      console.log("跳过转发推文");
      return;
    }

    const tweetId = 
      get(tweet, "raw.result.legacy.idStr") || 
      get(tweet, "tweet.rest_id") || 
      get(tweet, "tweet.legacy.id_str");
      
    if (!screenName || !tweetId) {
      console.log("跳过缺少用户名或推文ID的推文");
      return;
    }
    
    // 提取数据
    const tweetData = extractTweetData(tweet, screenName, tweetId);
    
    // 保存到 Supabase
    // await saveToSupabase(tweetData);
    
  } catch (tweetError) {
    console.error(`处理单条推文时出错:`, tweetError);
    stats.errors++;
  }
}

// 提取推文数据
function extractTweetData(tweet: any, screenName: string, tweetId: string) {
  const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

  // 提取用户信息
  const user = {
    screenName: screenName,
    name: get(tweet, "user.legacy.name"),
    profileImageUrl: get(tweet, "user.legacy.profileImageUrlHttps"),
    description: get(tweet, "user.legacy.description"),
    followersCount: get(tweet, "user.legacy.followersCount"),
    friendsCount: get(tweet, "user.legacy.friendsCount"),
    location: get(tweet, "user.legacy.location"),
  };

  // 提取媒体信息 - 尝试两种可能的路径
  const mediaItems = 
    get(tweet, "raw.result.legacy.extendedEntities.media", []) ||
    get(tweet, "tweet.legacy.extendedEntities.media", []);
    
  const images = mediaItems
    .filter((media: any) => media.type === "photo")
    .map((media: any) => media.mediaUrlHttps);

  // 提取视频
  const videos = mediaItems
    .filter(
      (media: any) => media.type === "video" || media.type === "animated_gif"
    )
    .map((media: any) => {
      const variants = get(media, "videoInfo.variants", []);
      const bestQuality = variants
        .filter((v: any) => v.contentType === "video/mp4")
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return bestQuality?.url;
    })
    .filter(Boolean);
    
  const fullText = 
    get(tweet, "raw.result.legacy.fullText") || 
    get(tweet, "tweet.legacy.fullText") || '';
    
  const createdAt = 
    get(tweet, "raw.result.legacy.createdAt") || 
    get(tweet, "tweet.legacy.createdAt");

  return {
    tweetId,
    tweetUrl,
    user,
    fullText,
    createdAt,
    images,
    videos
  };
}

// 5. 保存到 Supabase
async function saveToSupabase(tweetData: any) {
  // 保存用户到Supabase
  const userId = await saveUserToSupabase(tweetData.user);
  if (!userId) return;
  
  // 保存推文到Supabase
  await saveTweetToSupabase(tweetData, userId);
}

// 保存用户到Supabase
async function saveUserToSupabase(user: any) {
  // 查找是否已存在该用户
  let { data: existingUser, error: userQueryError } = await supabase
    .from('cron_twitter_users')
    .select('id')
    .eq('screen_name', user.screenName)
    .single();
  
  if (userQueryError && userQueryError.code !== 'PGRST116') {
    console.error(`查询用户时出错: ${userQueryError.message}`);
    stats.errors++;
    return null;
  }
  
  let userId;
  
  // 如果用户不存在，创建新用户
  if (!existingUser) {
    const { data: newUser, error: insertUserError } = await supabase
      .from('cron_twitter_users')
      .insert({
        screen_name: user.screenName,
        name: user.name || user.screenName,
        profile_image_url: user.profileImageUrl,
        description: user.description,
        followers_count: user.followersCount,
        friends_count: user.friendsCount,
        location: user.location
      })
      .select('id')
      .single();

    if (insertUserError) {
      console.error(`创建用户时出错: ${insertUserError.message}`);
      stats.errors++;
      return null;
    }

    userId = newUser.id;
    stats.usersAdded++;
    console.log(`创建了新用户: ${user.screenName}`);
  } else {
    userId = existingUser.id;
    
    // 更新用户信息
    const { error: updateUserError } = await supabase
      .from('cron_twitter_users')
      .update({
        name: user.name || user.screenName,
        profile_image_url: user.profileImageUrl,
        description: user.description,
        followers_count: user.followersCount,
        friends_count: user.friendsCount,
        location: user.location,
        updated_at: new Date()
      })
      .eq('id', userId);
    
    if (updateUserError) {
      console.error(`更新用户时出错: ${updateUserError.message}`);
      stats.errors++;
    } else {
      stats.usersUpdated++;
    }
  }
  
  return userId;
}

// 保存推文到Supabase
async function saveTweetToSupabase(tweetData: any, userId: number) {
  // 查找是否已存在该推文
  const { data: existingTweet, error: tweetQueryError } = await supabase
    .from('cron_twitter_tweets')
    .select('id')
    .eq('tweet_id', tweetData.tweetId)
    .single();
  
  if (tweetQueryError && tweetQueryError.code !== 'PGRST116') {
    console.error(`查询推文时出错: ${tweetQueryError.message}`);
    stats.errors++;
    return;
  }

  // 如果推文不存在，则添加
  if (!existingTweet) {
    const { error: insertTweetError } = await supabase
      .from('cron_twitter_tweets')
      .insert({
        tweet_id: tweetData.tweetId,
        user_id: userId,
        tweet_url: tweetData.tweetUrl,
        full_text: tweetData.fullText,
        created_at: tweetData.createdAt,
        images: tweetData.images || [],
        videos: tweetData.videos || []
      });

    if (insertTweetError) {
      console.error(`添加推文时出错: ${insertTweetError.message}`);
      stats.errors++;
      return;
    }

    stats.tweetsAdded++;
    console.log(`成功添加推文: ${tweetData.tweetUrl}`);
  }
}

// 打印统计信息
function printStats() {
  console.log(`
操作完成:
- 添加了 ${stats.usersAdded} 个新用户
- 更新了 ${stats.usersUpdated} 个现有用户
- 添加了 ${stats.tweetsAdded} 条新推文
- 遇到 ${stats.errors} 个错误
`);
}

// 获取推文数据并保存到Supabase
async function fetchAndSaveTweets() {
  await processAllUsers();
}

async function main() {
  // 直接获取推文并保存到Supabase
  await fetchAndSaveTweets();
}

main().catch(console.error);

