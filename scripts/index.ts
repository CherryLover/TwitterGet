import accounts from "../dev-accounts.json" with { type: "json" };
import { xGuestClient } from "./utils.ts";
import {get} from 'lodash';
import fs from 'fs-extra';

interface Account {
  id?: string;
  "username": string;
  "twitter_url": string;
  "description": string;
  "tags": string[];
}

const updatedAccounts: Account[] = [...accounts];
const appendedAccounts: Account[] = [];

for (const account of accounts) {
  if (fs.existsSync(`./accounts/${account.username}.json`)) {
    console.log(`${account.username} already exists`);
  }

  const client = await xGuestClient();
  let user: any = {};
  try {
    user = await client.getUserApi().getUserByScreenName({screenName: account.username});
    const userData = get(user, 'data.user', {});
    if (Object.keys(userData).length > 0) {
      fs.writeFileSync(`./accounts/${account.username}.json`, JSON.stringify(userData, null, 2));
      console.log(`${account.username} saved`);
      
      // 更新 dev-accounts.json 中的 id 字段
      const userIdBase64 = get(userData, 'id');
      if (userIdBase64) {
        // 解码 userIdBase64
        const userId = Buffer.from(userIdBase64, 'base64').toString('utf-8').split(':')[1];
        console.log(`${account.username} id: ${userId}`);
        for (const account of updatedAccounts) {
          if (account.username === account.username) {
            account.id = userId;
          }
        }
      }
    } else {
      console.log(`${account.username} data is empty`);
    }
  } catch (error) {
    console.error(`Error fetching ${account.username}:`, error);
  }
}

// 保存更新后的 dev-accounts.json
fs.writeFileSync('./dev-accounts.json', JSON.stringify(updatedAccounts, null, 2));
console.log('dev-accounts.json has been updated with user IDs');

