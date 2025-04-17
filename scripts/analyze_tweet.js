import fs from 'fs';

// 读取JSON文件
function analyzeTweet(filePath) {
  try {
    // 读取并解析JSON文件
    const tweetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 提取关键信息
    const result = {};
    
    // 判断是否为转发
    const isRetweet = tweetData.raw.result.legacy.fullText.startsWith('RT @');
    result.isRetweet = isRetweet;
    
    // 提取原始推文信息
    if (isRetweet && tweetData.raw.result.legacy.retweetedStatusResult) {
      const originalTweet = tweetData.raw.result.legacy.retweetedStatusResult.result;
      
      result.originalAuthor = {
        name: originalTweet.core.userResults.result.legacy.name,
        screenName: originalTweet.core.userResults.result.legacy.screenName,
        isVerified: originalTweet.core.userResults.result.isBlueVerified || false,
        followersCount: originalTweet.core.userResults.result.legacy.followersCount
      };
      
      result.originalTweetText = originalTweet.legacy.fullText;
      result.originalTweetDate = new Date(originalTweet.legacy.createdAt);
      result.originalTweetStats = {
        retweets: originalTweet.legacy.retweetCount,
        favorites: originalTweet.legacy.favoriteCount,
        replies: originalTweet.legacy.replyCount
      };
      
      // 检查是否包含媒体
      result.hasMedia = originalTweet.legacy.extendedEntities && 
                        originalTweet.legacy.extendedEntities.media && 
                        originalTweet.legacy.extendedEntities.media.length > 0;
      
      if(result.hasMedia) {
        result.mediaType = originalTweet.legacy.extendedEntities.media[0].type;

        if(result.mediaType === "photo") {
          result.imgUrls = originalTweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else if(result.mediaType === "video") {
          result.videoUrls = originalTweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else if(result.mediaType === "animated_gif") {
          result.gifUrls = originalTweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else {
          result.mediaType = "unknown";
        }
      }
      // 检查是否为长文本帖子
      // result.isNoteTweet = originalTweet.noteTweet && originalTweet.noteTweet.noteTweetResults;
      
      if (result.isNoteTweet) {
        result.fullNoteText = originalTweet.noteTweet.noteTweetResults.result.text;
      }

      // 转发内容
      result.forwardContent = originalTweet.legacy.fullText;
      
      // 检查语言
      result.language = originalTweet.legacy.lang;
    } else {
      // 非转发推文信息
      const tweet = tweetData.raw.result;
      
      result.author = {
        name: tweet.core.userResults.result.legacy.name,
        screenName: tweet.core.userResults.result.legacy.screenName,
        isVerified: tweet.core.userResults.result.isBlueVerified || false,
        followersCount: tweet.core.userResults.result.legacy.followersCount
      };
      
      result.tweetText = tweet.legacy.fullText;
      result.tweetDate = new Date(tweet.legacy.createdAt);
      result.tweetStats = {
        retweets: tweet.legacy.retweetCount,
        favorites: tweet.legacy.favoriteCount,
        replies: tweet.legacy.replyCount
      };
      
      // 检查是否包含媒体
      result.hasMedia = tweet.legacy.extendedEntities && 
                       tweet.legacy.extendedEntities.media && 
                       tweet.legacy.extendedEntities.media.length > 0;

      if(result.hasMedia) {
        result.mediaType = tweet.legacy.extendedEntities.media[0].type;

        if(result.mediaType === "photo") {
          result.imgUrls = tweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else if(result.mediaType === "video") {
          result.videoUrls = tweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else if(result.mediaType === "animated_gif") {
          result.gifUrls = tweet.legacy.extendedEntities.media.map(item => item.mediaUrlHttps);
        } else {
          result.mediaType = "unknown";
        }
      }
      
      // 检查是否为长文本帖子
      result.isNoteTweet = tweet.noteTweet && tweet.noteTweet.noteTweetResults;
      
      if (result.isNoteTweet) {
        result.fullNoteText = tweet.noteTweet.noteTweetResults.result.text;
      }
      
      // 检查语言
      result.language = tweet.legacy.lang;
    }
    
    // 判断推文类型
    result.tweetType = getTweetType(result);
    
    return result;
  } catch (error) {
    console.error('分析推文时出错:', error);
    return null;
  }
}

// 判断推文类型
function getTweetType(tweetInfo) {
  if (tweetInfo.isNoteTweet) {
    return 'NOTE_TWEET: 长文本';
  }
  
  if (tweetInfo.hasMedia) {
    return 'MEDIA_TWEET: 媒体';
  }
  
  // 判断是否是通知/公告类推文
  const announcementKeywords = ['📢', '公告', '通知', '发布', '更新', 'release', 'update', 'announcement'];
  const text = tweetInfo.originalTweetText || tweetInfo.tweetText || '';
  if (announcementKeywords.some(keyword => text.includes(keyword))) {
    return 'ANNOUNCEMENT: 公告';
  }
  
  // 判断是否是AI相关推文
  const aiKeywords = ['AI', '人工智能', 'Midjourney', 'GPT', 'Machine Learning', '机器学习'];
  if (aiKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
    return 'AI_RELATED: AI相关';
  }
  
  return 'REGULAR_TWEET: 普通推文';
}

// 主函数
function main() {
  const debugDir = process.argv[2] || 'debug';
  
  try {
    // 检查目录是否存在
    if (!fs.existsSync(debugDir)) {
      console.log(`目录 ${debugDir} 不存在`);
      return;
    }
    
    // 读取目录下所有文件
    const files = fs.readdirSync(debugDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && !file.endsWith('-analyze.json'));
    
    if (jsonFiles.length === 0) {
      console.log(`在 ${debugDir} 中未找到JSON文件`);
      return;
    }
    
    console.log(`找到 ${jsonFiles.length} 个JSON文件需要分析`);
    
    // 遍历每个文件并分析
    jsonFiles.forEach(file => {
      const filePath = `${debugDir}/${file}`;
      console.log(`正在分析: ${filePath}`);
      
      const result = analyzeTweet(filePath);
      
      if (result) {
        // 创建输出文件名
        const outputFile = `${debugDir}/${file.replace('.json', '')}-analyze.json`;
        
        // 写入分析结果
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
        console.log(`分析结果已保存至: ${outputFile}`);
      } else {
        console.log(`无法分析文件: ${filePath}`);
      }
    });
  } catch (error) {
    console.error('处理文件时出错:', error);
  }
}

// 检查是否为直接执行
if (process.argv[1] === import.meta.url || process.argv[1].endsWith('analyze_tweet.js')) {
  main();
}

export { analyzeTweet, getTweetType }; 