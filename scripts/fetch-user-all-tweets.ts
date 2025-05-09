/**
 * Twitter用户所有推文获取脚本
 * 
 * 该脚本获取指定Twitter用户的所有推文，并将重组后的内容以JSON格式保存到本地。
 * 
 * 环境变量配置:
 * - AUTH_TOKEN: Twitter认证令牌
 * - DEBUG: 设置为'true'开启调试模式
 * 
 * 使用方式:
 * 1. 设置环境变量
 * 2. 运行 `ts-node scripts/fetch-user-all-tweets.ts 用户名 [用户ID]`
 *    - 用户名: Twitter用户名（必需）
 *    - 用户ID: Twitter用户的数字ID（可选，如果无法自动获取则必需）
 * 
 * 输出:
 * - 在debug目录下生成名为`all_tweet用户名.json`的文件
 */

import type { TweetApiUtilsData } from "twitter-openapi-typescript";
import * as i from "twitter-openapi-typescript-generated";
import { XAuthClient, xGuestClient } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import dotenv from 'dotenv';
import { createAIService } from "./ai-service";
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

const debug = (process.env.DEBUG || 'false') === 'true';

// 获取Supabase凭证
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('错误: 缺少SUPABASE_URL或SUPABASE_ANON_KEY环境变量');
    process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

// 初始化Twitter客户端
let client: any;
let guestClient: any;

// 统计计数器
const stats = {
  tweetsCollected: 0,
  errors: 0
};

// 添加调试函数
function debugObject(obj: any, label: string) {
  console.log(`=== DEBUG ${label} ===`);
  try {
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
- 收集了 ${stats.tweetsCollected} 条推文
- 遇到 ${stats.errors} 个错误
`);
}

// 判断推文内容类型
async function judgeContentType(tweetData: any) {
  try {
    // 构建用户提示
    let userPrompt = "";
    userPrompt += `\n\n${tweetData.fullText}`;
    userPrompt += `\n\n图片:\n\n`;
    
    // 添加图片信息
    let imgUrlCount = 0;
    let imgAltCount = 0;
    const images = tweetData.images || [];
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      if (typeof image === 'string') {
        userPrompt += `图片${index+1}:\nURL: ${image}\n`;
      } else if (typeof image === 'object') {
        userPrompt += `图片${index+1}:\nURL: ${image.url || ''}\nAlt: ${image.alt || ''}\n`;
        if (image.url) {
          imgUrlCount++;
        }
        if (image.alt) {
          imgAltCount++;
        }
      }
    }
    // 如果图片数量小于2，则认为是帖子，AI 绘图需要图片 + 描述
    if (imgUrlCount < 2  || imgAltCount < 2) {
      return 'post';
    }

    try {
      // 创建AI服务实例
      const aiService = createAIService();
      
      // 调用AI服务进行内容类型分析
      const result = await aiService.contentTypeAnalysis(userPrompt);
      const contentType = result.content_type || 'unknown';
      const analysisReason = result.analysis_reason || '';
      const contentTypeScore = result.content_type_score || 0;
      
      console.log(`内容类型: ${contentType}\n分析原因: ${analysisReason}\n内容类型得分: ${contentTypeScore}`);
      
      return contentType;
    } catch (error) {
      console.error('AI服务调用失败，默认返回post类型:', error);
      return 'post';
    }
  } catch (error) {
    console.error('判断内容类型时出错:', error);
    return 'unknown';
  }
}

// 过滤推文
function filterTweets(tweets: any[]) {
  // 依次应用多个过滤器
  const withoutPromoted = tweets.filter(filterPromotedContent);
  const withoutRetweets = withoutPromoted.filter(filterRetweets);
  
  console.log(`过滤后剩余 ${withoutRetweets.length} 条推文`);
  return withoutRetweets;
}

// 过滤推广内容
function filterPromotedContent(tweet: any): boolean {
  if (tweet.promotedMetadata) {
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

// 获取用户推文
async function getUserTweets(userId: string, username: string, cursor?: string) {
  try {
    console.log(`开始获取用户 ${username} (ID: ${userId}) 的推文${cursor ? '，cursor: ' + cursor : ''}`);
    
    // 构建请求参数
    const params: any = {
      userId: userId
    };
    
    // 如果有cursor，添加到参数中
    if (cursor) {
      params.cursor = cursor;
    }
    
    const resp = await client.getTweetApi().getUserTweets(params);
    
    console.log(`用户 ${username} 的推文API调用已完成`);
    
    if (!resp.data || !resp.data.data || resp.data.data.length === 0) {
      console.log(`此次调用未找到推文`);
      return { tweets: [], nextCursor: undefined };
    }
    
    console.log(`找到 ${resp.data.data.length} 条推文`);
    
    // 尝试获取下一页的cursor
    let nextCursor: string | undefined = undefined;
    try {
      nextCursor = get(resp.data, 'cursor.bottom.value');
    } catch (error) {
      console.log('获取下一页cursor失败:', error);
    }
    
    if (debug) {
      debugObject(resp.data, `api-response-${username}-${new Date().getTime()}`);
    }
    
    return { tweets: resp.data.data, nextCursor };
  } catch (error) {
    console.error(`获取用户 ${username} 的推文时出错:`, error);
    
    // 尝试查看错误响应内容
    if (error && typeof error === 'object' && 'response' in error) {
      try {
        const errorResponse = (error as any).response;
        if (errorResponse && errorResponse.data) {
          console.error('错误响应详情:', JSON.stringify(errorResponse.data, null, 2));
        }
      } catch (e) {
        console.error('无法解析错误响应');
      }
    }
    
    return { tweets: [], nextCursor: undefined };
  }
}

// 获取用户ID
async function getUserId(username: string) {
  // 创建Twitter客户端
  const client = await xGuestClient();
  
  // 对每个用户刷新信息
    try {
      console.log(`正在刷新用户 ${username} 的信息...`);
      
      let userInfo;
      userInfo = await client.getUserApi().getUserByScreenName({screenName: username});
    //   console.log(`userInfo: ${JSON.stringify(userInfo)}`);
      const userData = get(userInfo, 'data.user', {});
      const restId = get(userData, 'restId', '');
      return restId;
      
    } catch (error) {
      console.error(`刷新用户 ${username} 信息时出错:`, error);
      throw error;
    }
}

// 提取推文数据
function extractTweetData(tweet: any, screenName: string, tweetId: string) {
  const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

  // 提取rest_id (用户唯一标识符)
  const restId = get(tweet, "user.rest_id") || get(tweet, "raw.result.core.user_results.result.rest_id") || '';

  // 提取用户信息
  const user = {
    restId: tweet.runtime_rest_id || restId, // 添加rest_id字段
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
    restId, // 直接在顶层也保存rest_id
    contentType: 'unknown' // 默认设置为unknown
  };
}

// 处理单条推文
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
    
    if (!screenName) {
      console.log("跳过缺少用户名的推文");
      return null;
    }

    const tweetId = 
      get(tweet, "raw.result.legacy.idStr") || 
      get(tweet, "tweet.rest_id") || 
      get(tweet, "tweet.legacy.id_str");
      
    if (!tweetId) {
      console.log(`跳过缺少推文ID的推文 (用户: ${screenName})`);
      return null;
    }
    
    console.log(`处理推文: ${screenName} - ID: ${tweetId}`);
    
    // 提取数据
    try {
      const tweetData = extractTweetData(tweet, screenName, tweetId);
      
      // 只有开启调试模式才进行内容类型判断，避免额外的API调用
      let contentType = 'unknown';
      // 根据简单规则进行判断
      if (tweetData.images && tweetData.images.length > 0) {
        contentType = 'post_with_media';
      } else if (tweetData.videos && tweetData.videos.length > 0) {
        contentType = 'post_with_video';
      } else {
        contentType = 'post';
      }
      
      // 将内容类型添加到推文数据中
      tweetData.contentType = contentType;
      
      return tweetData;
    } catch (extractError) {
      console.error(`提取推文数据时出错:`, extractError);
      stats.errors++;
      return null;
    }
    
  } catch (tweetError) {
    console.error(`处理单条推文时出错:`, tweetError);
    stats.errors++;
    return null;
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
        return false;
      }
      
      return !!existingTweet;
    } catch (error) {
      console.error(`检查推文是否存在时出错:`, error);
      return false;
    }
  }

  // 保存推文到 supabase
  async function saveTweetsToSupabase(tweets: any[]) {
    try {
        let insertTweets = tweets.map((tweet) => ({
            tweet_id: tweet.tweetId,
            user_id: tweet.user.restId,
            tweet_url: tweet.tweetUrl,
            full_text: tweet.fullText,
            created_at: tweet.createdAt,
            images: tweet.images || [],
            videos: tweet.videos || [],
            content_type: tweet.contentType || 'unknown'
        }));
      const { data: existingTweets, error: existingTweetsError } = await supabase
        .from('cron_twitter_tweets')
        .insert(insertTweets)
        .select();
  
      if (existingTweetsError) {
        console.error(`保存推文时出错:`, existingTweetsError);
        throw existingTweetsError;
      }
      
      console.log(`成功保存 ${existingTweets.length} 条推文到 Supabase`);
    } catch (error) {
      console.error(`保存推文时出错:`, error);
      throw error;
    }
  }
  

// 获取用户所有推文
async function fetchAllUserTweets(username: string, userId: string) {
  try {
    console.log(`开始获取用户 ${username} (ID: ${userId}) 的所有推文`);
    
    let allTweets: any[] = [];
    let nextCursor: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 2; // 设置最大页数限制，避免无限循环
    
    do {
      pageCount++;
      console.log(`===== 获取第 ${pageCount} 页推文 =====`);
      
      try {
        // 获取推文
        const { tweets, nextCursor: cursor } = await getUserTweets(userId, username, nextCursor);
        nextCursor = cursor;
        
        if (tweets.length === 0) {
          console.log('没有更多推文了');
          break;
        }
        
        // 过滤推文
        const filteredTweets = filterTweets(tweets);
        
        if (filteredTweets.length > 0) {
          console.log(`处理第 ${pageCount} 页中的 ${filteredTweets.length} 条推文`);
          
          // 处理每条推文
          for (const tweet of filteredTweets) {
            tweet.runtime_rest_id = userId;
            const tweetData = await processTweet(tweet);
            if (tweetData) {
              if (await checkTweetExists(tweetData.tweetId)) {
                console.log(`推文 ${tweetData.tweetId} 已存在，跳过`);
                continue;
              }
              allTweets.push(tweetData);
              stats.tweetsCollected++;
            }
          }
        } else {
          console.log(`第 ${pageCount} 页推文全部被过滤掉了`);
        }
      } catch (pageError) {
        console.error(`获取第 ${pageCount} 页推文时出错:`, pageError);
        stats.errors++;
        // 继续尝试下一页
        break;
      }

      // 保存推文到 supabase
      if (allTweets.length > 0) {
        await saveTweetsToSupabase(allTweets);
      }
      
      // 添加延迟，避免API限制
      if (nextCursor) {
        console.log('等待2秒后继续获取下一页...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if(nextCursor === undefined) {
        console.log('cursor 为空，没有更多推文了');
      }
    } while (nextCursor && pageCount < maxPages);
    
    console.log(`===== 完成获取，总共收集了 ${allTweets.length} 条推文 =====`);
    
    // 保存所有推文到本地文件
    if (allTweets.length > 0) {
      const outputFilePath = path.join('./debug', `all_tweet_${username}.json`);
      fs.ensureDirSync('./debug');
      fs.writeFileSync(outputFilePath, JSON.stringify(allTweets, null, 2));
      console.log(`已将 ${allTweets.length} 条推文保存到文件: ${outputFilePath}`);
    } else {
      console.log(`没有找到用户 ${username} 的有效推文`);
    }
    
    return allTweets;
  } catch (error) {
    console.error(`获取用户 ${username} 的所有推文时出错:`, error);
    throw error;
  }
}

async function main() {
  try {
    // 检查命令行参数
    const username = process.argv[2];
    let userId = process.argv[3];
    
    if (!username) {
      console.error('错误: 请提供Twitter用户名作为参数');
      console.log('用法: ts-node scripts/fetch-user-all-tweets.ts 用户名 [用户ID]');
      process.exit(1);
    }
    
    console.log(`开始执行获取用户 ${username} 的所有推文脚本`);
    
    // 初始化Twitter客户端
    client = await XAuthClient();
    
    // 如果没有提供用户ID，尝试获取
    if (!userId) {
      try {
        userId = await getUserId(username);
        if (!userId) {
          throw new Error('获取到的用户ID为空');
        }
      } catch (error) {
        console.error(`获取用户ID失败，请直接提供用户ID作为第二个参数`);
        console.log('用法: ts-node scripts/fetch-user-all-tweets.ts 用户名 用户ID');
        process.exit(1);
      }
    }
    
    console.log(`使用用户ID: ${userId} 获取用户 ${username} 的推文`);
    
    // 获取并保存用户所有推文
    await fetchAllUserTweets(username, userId);
    
    printStats();
    console.log('脚本执行完成');
  } catch (error) {
    console.error('脚本执行过程中出错:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('程序执行出错:', error);
  process.exit(1);
});
