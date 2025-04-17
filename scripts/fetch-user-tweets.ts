import type { TweetApiUtilsData } from "twitter-openapi-typescript";
import * as i from "twitter-openapi-typescript-generated";
import { XAuthClient } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createAIService } from "./ai-service";

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
    const debugFilePath = `./debug/${label}.json`;
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

// 判断推文内容类型
async function judgeContentType(tweetData: any) {
  try {
    // 创建AI服务实例
    const aiService = createAIService();
    
    // 构建用户提示
    let userPrompt = "";
    userPrompt += `\n\n${tweetData.fullText}`;
    userPrompt += `\n\n图片:\n\n`;
    
    // 添加图片信息
    const images = tweetData.images || [];
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      if (typeof image === 'string') {
        userPrompt += `图片${index+1}:\nURL: ${image}\n`;
      } else if (typeof image === 'object') {
        userPrompt += `图片${index+1}:\nURL: ${image.url || ''}\nAlt: ${image.alt || ''}\n`;
      }
    }
    
    // console.log(`用户提示: ${userPrompt}`);
    
    // 调用AI服务进行内容类型分析
    const result = await aiService.contentTypeAnalysis(userPrompt);
    const contentType = result.content_type || 'unknown';
    const analysisReason = result.analysis_reason || '';
    const contentTypeScore = result.content_type_score || 0;
    
    console.log(`内容类型: ${contentType}\n分析原因: ${analysisReason}\n内容类型得分: ${contentTypeScore}`);
    
    return contentType;
  } catch (error) {
    console.error('判断内容类型时出错:', error);
    return 'unknown';
  }
}

// 检查推文是否已存在于 Supabase
async function checkTweetExists(tweetId: string): Promise<boolean> {
  try {
    const { data: existingTweet, error: tweetQueryError } = await supabase
      .from('cron_twitter_tweets')
      .select('id')
      .eq('tweet_id', tweetId)
      .single();
    
    if (tweetQueryError && tweetQueryError.code !== 'PGRST116') {
      console.error(`查询推文时出错: ${tweetQueryError.message}`);
      stats.errors++;
      return false;
    }
    
    return !!existingTweet;
  } catch (error) {
    console.error(`检查推文是否存在时出错:`, error);
    stats.errors++;
    return false;
  }
}

// 过滤已存在的推文
async function filterExistingTweets(tweets: any[]): Promise<any[]> {
  const filteredTweets = [];
  for (const tweet of tweets) {
    const tweetId = 
      get(tweet, "raw.result.legacy.idStr") || 
      get(tweet, "tweet.rest_id") || 
      get(tweet, "tweet.legacy.id_str");
      
    if (tweetId && !(await checkTweetExists(tweetId))) {
      filteredTweets.push(tweet);
    } else {
      console.log(`跳过已存在的推文: ${tweetId}`);
    }
  }
  return filteredTweets;
}

// 1. 遍历用户并处理推文
async function processAllUsers() {
  for (const account of devAccounts) {
    try {
      console.log(`获取用户 ${account.username} (ID: ${account.id}) 的推文`);
      
      // 获取推文
      const tweets = await getUserTweets(account.id, account.username);
      
      // 过滤推文
      const filteredTweets = await filterTweets(tweets);
      
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
  
  for(let index = 0; index < resp.data.data.length; index++) {
    const tweet = resp.data.data[index];
    debugObject(tweet, `temp-${index}`);
  }
  
  return resp.data.data;
}

// 3. 过滤推文
async function filterTweets(tweets: any[]) {
  // 依次应用多个过滤器
  const withoutPromoted = tweets.filter(filterPromotedContent);
  const withoutOld = withoutPromoted.filter(filterOldTweets);
  const withoutRetweets = withoutOld.filter(filterRetweets);
  
  // 过滤掉已存在的推文
  const filteredTweets = await filterExistingTweets(withoutRetweets);
  
  console.log(`过滤后剩余 ${filteredTweets.length} 条推文`);
  return filteredTweets;
}

// 过滤推广内容
function filterPromotedContent(tweet: any): boolean {
  if (tweet.promotedMetadata) {
    return false;
  }
  return true;
}

// 过滤超过30天的推文
function filterOldTweets(tweet: any): boolean {
  const createdAt = 
    get(tweet, "raw.result.legacy.createdAt") || 
    get(tweet, "tweet.legacy.createdAt");
  if (createdAt && dayjs().diff(dayjs(createdAt), "day") > 30) {
    console.log("跳过超过30天的推文");
    return false;
  }
  return true;
}

// 过滤转发推文
function filterRetweets(tweet: any): boolean {
  const fullTextContent = get(tweet, "raw.result.legacy.fullText") || get(tweet, "tweet.legacy.fullText") || '';
  const isRetweet = fullTextContent.startsWith('RT @') || get(tweet, "raw.result.legacy.isRetweet");
  if (isRetweet) {
    console.log("跳过转发推文");
    return false;
  }
  return true;
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
    
    console.log(`处理推文: ${screenName ? screenName : '未知用户'}`);

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
    
    // 判断内容类型
    const contentType = await judgeContentType(tweetData);
    console.log(`推文内容类型: ${contentType}`);
    
    // 将内容类型添加到推文数据中
    tweetData.contentType = contentType;
    
    // 对不同内容类型的处理
    if (contentType === 'ai_draw') {
      await handleAiDrawTweet(tweetData);
    }

    // 其他类型的推文仍然使用现有的保存流程,为了加上过滤，所以 ai 的也保存
    await saveToSupabase(tweetData);
    
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
    .map((media: any) => {
      const imgObj = {
        url: media.mediaUrlHttps,
        alt: media.extAltText,
      };
      return imgObj;
    });

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
    videos,
    contentType: 'unknown' // 默认设置为unknown
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

// 处理AI绘画类型的推文
async function handleAiDrawTweet(tweetData: any) {
  // TODO: 实现专门的AI绘画处理逻辑
  console.log(`处理AI绘画推文: ${JSON.stringify(tweetData, null, 2)}`);
  const response = await fetch('https://py-service.flyooo.uk/social/save_from_twitter_fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(tweetData),
  });
  const data = await response.json();
  console.log(`AI绘画推文处理结果: ${JSON.stringify(data, null, 2)}`);
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
        videos: tweetData.videos || [],
        content_type: tweetData.contentType || 'unknown' // 添加内容类型
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

// 获取推文数据并保存到Supabase
async function fetchAndSaveTweets() {
  await processAllUsers();
}

async function main() {
  // 直接获取推文并保存到Supabase
  await fetchAndSaveTweets();
}

main().catch(console.error);