import { createClient } from '@supabase/supabase-js';
import { xGuestClient } from "./utils.ts";
import { get } from 'lodash';
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

// 统计计数器
const stats = {
  usersUpdated: 0,
  errors: 0
};

// 主函数
async function main() {
  console.log('开始刷新用户信息...');
  
  // 从数据库中查询有name的用户
  const { data: users, error } = await supabase
    .from('cron_twitter_users_ext')
    .select('id, rest_id, name, screen_name')
    .not('name', 'is', null);
  
  if (error) {
    console.error('查询用户时出错:', error.message);
    return;
  }
  
  console.log(`找到 ${users.length} 个用户需要刷新信息`);
  
  // 创建Twitter客户端
  const client = await xGuestClient();
  
  // 对每个用户刷新信息
  for (const user of users) {
    try {
      console.log(`正在刷新用户 ${user.name} (${user.screen_name || '无用户名'}) 的信息...`);
      
      let userInfo;
      if (user.screen_name) {
        // 如果有screen_name，优先使用screen_name查询
        userInfo = await client.getUserApi().getUserByScreenName({screenName: user.screen_name});
      } else {
        // 否则尝试使用name查询（可能不准确，因为name不是唯一的）
        userInfo = await client.getUserApi().getUserByScreenName({screenName: user.name});
      }
      
      const userData = get(userInfo, 'data.user', {});
      
      if (Object.keys(userData).length > 0) {
        // 直接更新数据库
        const screenName = get(userData, 'legacy.screenName') || user.screen_name || user.name;
        await updateUserInDatabase(user.id, userData);
        stats.usersUpdated++;
        console.log(`成功更新用户 ${screenName} 的信息`);
      } else {
        console.log(`获取用户 ${user.name} 的信息为空`);
        stats.errors++;
      }
    } catch (error) {
      console.error(`刷新用户 ${user.name} 信息时出错:`, error);
      stats.errors++;
    }
    
    // 简单的延迟，避免API限制
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n刷新用户信息完成!');
  console.log(`更新用户: ${stats.usersUpdated}`);
  console.log(`错误数量: ${stats.errors}`);
}

// 更新用户信息到数据库
async function updateUserInDatabase(userId: number, userData: any) {
  try {
    // 提取需要的字段，使用安全的get方法
    const userLegacy = get(userData, 'legacy', {});
    const restId = get(userData, 'restId', '');
    
    // 从base64 ID解码用户ID（如果需要）
    let decodedId = '';
    if (userData.id) {
      try {
        decodedId = Buffer.from(userData.id, 'base64').toString('utf-8').split(':')[1];
      } catch (e) {
        console.warn(`无法解码用户ID: ${userData.id}`);
      }
    }
    
    // 准备更新数据
    const updateData = {
      rest_id: restId,
      name: get(userLegacy, 'name', ''),
      avatar: get(userLegacy, 'profileImageUrlHttps', ''),
      screen_name: get(userLegacy, 'screenName', ''),
      description: get(userLegacy, 'description', ''),
      location: get(userLegacy, 'location', ''),
      followers_count: get(userLegacy, 'followersCount', 0),
      following_count: get(userLegacy, 'friendsCount', 0),
      tweets_count: get(userLegacy, 'statusesCount', 0),
      profile_url: `https://x.com/${get(userLegacy, 'screenName', '')}`,
      raw_data: userData,
      updated_at: new Date()
    };
    
    // 更新数据库
    const { error } = await supabase
      .from('cron_twitter_users_ext')
      .update(updateData)
      .eq('id', userId);
    
    if (error) {
      throw new Error(`更新数据库出错: ${error.message}`);
    }
    
    return true;
  } catch (error) {
    console.error(`更新用户 ID ${userId} 信息到数据库时出错:`, error);
    stats.errors++;
    return false;
  }
}

// 运行主函数
main().catch(error => {
  console.error('程序执行出错:', error);
  process.exit(1);
}); 