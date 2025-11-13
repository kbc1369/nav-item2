const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const config = require('./config');

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new sqlite3.Database(path.join(dbDir, 'nav.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_menus_order ON menus("order")`);
  
  // 添加子菜单表
  db.run(`CREATE TABLE IF NOT EXISTS sub_menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sub_menus_parent_id ON sub_menus(parent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sub_menus_order ON sub_menus("order")`);
  
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id INTEGER,
    sub_menu_id INTEGER,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_url TEXT,
    custom_logo_path TEXT,
    desc TEXT,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE,
    FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cards_menu_id ON cards(menu_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cards_sub_menu_id ON cards(sub_menu_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cards_order ON cards("order")`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  db.run(`CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position TEXT NOT NULL, -- left/right
    img TEXT NOT NULL,
    url TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ads_position ON ads(position)`);
  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    logo TEXT
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_friends_title ON friends(title)`);

  // 检查菜单表是否为空，若为空则插入默认菜单
  db.get('SELECT COUNT(*) as count FROM menus', (err, row) => {
    if (row && row.count === 0) {
      const defaultMenus = [
        ['Home', 1],
        ['Ai Stuff', 2],
        ['Cloud', 3],
        ['Container', 4],
        ['Software', 5],
        ['Tools', 6],
        ['Mail or Domain', 7],
        ['Other', 8]
      ];
      const stmt = db.prepare('INSERT INTO menus (name, "order") VALUES (?, ?)');
      defaultMenus.forEach(([name, order]) => stmt.run(name, order));
      stmt.finalize(() => {
        // 确保菜单插入完成后再插入子菜单和卡片
        console.log('菜单插入完成，开始插入默认子菜单和卡片...');
        insertDefaultSubMenusAndCards();
      });
    }
  });

  // 插入默认子菜单和卡片的函数
  function insertDefaultSubMenusAndCards() {
    db.all('SELECT * FROM menus ORDER BY "order"', (err, menus) => {
      if (err) {
        console.error('获取菜单失败:', err);
        return;
      }
      
      if (menus && menus.length) {
        console.log('找到菜单数量:', menus.length);
        menus.forEach(menu => {
          console.log(`菜单: ${menu.name} (ID: ${menu.id})`);
        });
        
        const menuMap = {};
        menus.forEach(m => { menuMap[m.name] = m.id; });
        console.log('菜单映射:', menuMap);
        
        // 插入子菜单
        const subMenus = [
          { parentMenu: 'Ai Stuff', name: 'AI chat', order: 1 },
          { parentMenu: 'Ai Stuff', name: 'AI tools', order: 2 },
          { parentMenu: 'Container', name: 'Game Server', order: 1 },
          { parentMenu: 'Tools', name: 'Free SMS', order: 1 },
          { parentMenu: 'Software', name: 'Proxy', order: 1 },
          { parentMenu: 'Software', name: 'Macos', order: 2 },
        ];
        
        const subMenuStmt = db.prepare('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)');
        let subMenuInsertCount = 0;
        const subMenuMap = {};
        
        subMenus.forEach(subMenu => {
          if (menuMap[subMenu.parentMenu]) {
            subMenuStmt.run(menuMap[subMenu.parentMenu], subMenu.name, subMenu.order, function(err) {
              if (err) {
                console.error(`插入子菜单失败 [${subMenu.parentMenu}] ${subMenu.name}:`, err);
              } else {
                subMenuInsertCount++;
                // 保存子菜单ID映射，用于后续插入卡片
                subMenuMap[`${subMenu.parentMenu}_${subMenu.name}`] = this.lastID;
                console.log(`成功插入子菜单 [${subMenu.parentMenu}] ${subMenu.name} (ID: ${this.lastID})`);
              }
            });
          } else {
            console.warn(`未找到父菜单: ${subMenu.parentMenu}`);
          }
        });
        
        subMenuStmt.finalize(() => {
          console.log(`所有子菜单插入完成，总计: ${subMenuInsertCount} 个子菜单`);
          
          // 插入卡片（包括主菜单卡片和子菜单卡片）
          const cards = [
            // Home
            { menu: 'Home', title: 'Baidu', url: 'httpss://www.baidu.com', logo_url: '', desc: '全球最大的中文搜索引擎'  },
            { menu: 'Home', title: 'Youtube', url: 'httpss://www.youtube.com', logo_url: 'httpss://img.icons8.com/ios-filled/100/ff1d06/youtube-play.png', desc: '全球最大的视频社区'  },
            { menu: 'Home', title: 'Gmail', url: 'httpss://mail.google.com', logo_url: 'httpss://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: ''  },
            { menu: 'Home', title: 'GitHub', url: 'httpss://github.com', logo_url: '', desc: '全球最大的代码托管平台'  },
            { menu: 'Home', title: 'ip.sb', url: 'httpss://ip.sb', logo_url: '', desc: 'ip地址查询'  },
            { menu: 'Home', title: 'Cloudflare', url: 'httpss://dash.cloudflare.com', logo_url: '', desc: '全球最大的cdn服务商'  },
            { menu: 'Home', title: 'ChatGPT', url: 'httpss://chat.openai.com', logo_url: 'httpss://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: '人工智能AI聊天机器人'  },
            { menu: 'Home', title: 'Huggingface', url: 'httpss://huggingface.co', logo_url: '', desc: '全球最大的开源模型托管平台'  },
            { menu: 'Home', title: 'ITDOG - 在线ping', url: 'httpss://www.itdog.cn/tcping', logo_url: '', desc: '在线tcping'  },
            { menu: 'Home', title: 'Ping0', url: 'httpss://ping0.cc', logo_url: '', desc: 'ip地址查询'  },
            { menu: 'Home', title: '浏览器指纹', url: 'httpss://www.browserscan.net/zh', logo_url: '', desc: '浏览器指纹查询'  },
            { menu: 'Home', title: 'nezha面板', url: 'httpss://ssss.nyc.mn', logo_url: 'httpss://nezha.wiki/logo.png', desc: 'nezha面板'  },
            { menu: 'Home', title: 'Api测试', url: 'httpss://hoppscotch.io', logo_url: '', desc: '在线api测试工具'  },
            { menu: 'Home', title: '域名检查', url: 'httpss://who.cx', logo_url: '', desc: '域名可用性查询' },
            { menu: 'Home', title: '域名比价', url: 'httpss://www.whois.com', logo_url: '', desc: '域名价格比较' },
            { menu: 'Home', title: 'NodeSeek', url: 'httpss://www.nodeseek.com', logo_url: 'httpss://www.nodeseek.com/static/image/favicon/favicon-32x32.png', desc: '主机论坛' },
            { menu: 'Home', title: 'Linux do', url: 'httpss://linux.do', logo_url: 'httpss://linux.do/uploads/default/optimized/3X/9/d/9dd49731091ce8656e94433a26a3ef36062b3994_2_32x32.png', desc: '新的理想型社区' },
            { menu: 'Home', title: '在线音乐', url: 'httpss://music.eooce.com', logo_url: 'httpss://p3.music.126.net/tBTNafgjNnTL1KlZMt7lVA==/18885211718935735.jpg', desc: '在线音乐' },
            { menu: 'Home', title: '在线电影', url: 'httpss://libretv.eooce.com', logo_url: 'httpss://img.icons8.com/color/240/cinema---v1.png', desc: '在线电影'  },
            { menu: 'Home', title: '免费接码', url: 'httpss://www.smsonline.cloud/zh', logo_url: '', desc: '免费接收短信验证码' },
            { menu: 'Home', title: '订阅转换', url: 'httpss://sublink.eooce.com', logo_url: 'httpss://img.icons8.com/color/96/link--v1.png', desc: '最好用的订阅转换工具' },
            { menu: 'Home', title: 'webssh', url: 'httpss://ssh.eooce.com', logo_url: 'httpss://img.icons8.com/fluency/240/ssh.png', desc: '最好用的webssh终端管理工具' },
            { menu: 'Home', title: '文件快递柜', url: 'httpss://filebox.nnuu.nyc.mn', logo_url: 'httpss://img.icons8.com/nolan/256/document.png', desc: '文件输出分享' },
            { menu: 'Home', title: '真实地址生成', url: 'httpss://address.nnuu.nyc.mn', logo_url: 'httpss://static11.meiguodizhi.com/favicon.ico', desc: '基于当前ip生成真实的地址' },
            // AI Stuff
            { menu: 'Ai Stuff', title: 'ChatGPT', url: 'httpss://chat.openai.com', logo_url: 'httpss://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { menu: 'Ai Stuff', title: 'Deepseek', url: 'httpss://www.deepseek.com', logo_url: 'httpss://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            { menu: 'Ai Stuff', title: 'Claude', url: 'httpss://claude.ai', logo_url: 'httpss://img.icons8.com/fluency/240/claude-ai.png', desc: 'Anthropic Claude AI' },
            { menu: 'Ai Stuff', title: 'Google Gemini', url: 'httpss://gemini.google.com', logo_url: 'httpss://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg', desc: 'Google Gemini大模型' },
            { menu: 'Ai Stuff', title: '阿里千问', url: 'httpss://chat.qwenlm.ai', logo_url: 'httpss://g.alicdn.com/qwenweb/qwen-ai-fe/0.0.11/favicon.ico', desc: '阿里云千问大模型' },
            { menu: 'Ai Stuff', title: '问小白', url: 'httpss://www.wenxiaobai.com', logo_url: 'httpss://wy-static.wenxiaobai.com/wenxiaobai-web/production/3.12.14/_next/static/media/new_favicon.6d31cfe4.png', desc: 'Deepseek三方平台' },
            { menu: 'Ai Stuff', title: 'Genspark', url: 'httpss://www.genspark.ai/agents?type=moa_chat', logo_url: 'httpss://www.genspark.ai/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'AkashChat', url: 'httpss://chat.akash.network', logo_url: 'httpss://chat.akash.network/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'V0', url: 'httpss://v0.app/chat', logo_url: 'httpss://v0.dev/assets/icon-light-32x32.png', desc: 'Vercel旗下前端AI编程工具' },
            { menu: 'Ai Stuff', title: 'Same', url: 'httpss://same.new/', logo_url: 'httpss://same.new/favicon.ico', desc: 'AI快速仿站' },
            { menu: 'Ai Stuff', title: '响指HaiSnap', url: 'httpss://www.haisnap.com', logo_url: 'httpss://www.haisnap.com/favicon.ico', desc: '人人都能创造的AI零代码应用平台' },
            { menu: 'Ai Stuff', title: 'Readdy', url: 'httpss://readdy.ai/zh', logo_url: 'httpss://static.readdy.ai/web/favicon-180.png', desc: '' },
            { menu: 'Ai Stuff', title: 'OpenRouter', url: 'httpss://openrouter.ai', logo_url: 'httpss://openrouter.ai/favicon.ico', desc: '开放API平台' },
            { menu: 'Ai Stuff', title: 'Manus', url: 'httpss://manus.im', logo_url: 'httpss://manus.im/icon.png', desc: '全场景AI Agent' },
            { menu: 'Ai Stuff', title: 'Perplexity', url: 'httpss://www.perplexity.ai', logo_url: '', desc: '' },
            { menu: 'Ai Stuff', title: 'Grok', url: 'httpss://grok.com', logo_url: 'httpss://img.icons8.com/ios-filled/50/grok.png', desc: '马斯克出品的 AI' },
            { menu: 'Ai Stuff', title: 'Copilot', url: 'httpss://copilot.microsoft.com', logo_url: 'httpss://copilot.microsoft.com/favicon.ico', desc: '微软旗下 AI' },
            { menu: 'Ai Stuff', title: '豆包', url: 'httpss://www.doubao.com/chat', logo_url: 'httpss://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/web/logo-icon.png', desc: '字节旗下AI智能助手' },
            { menu: 'Ai Stuff', title: '文心一言', url: 'httpss://yiyan.baidu.com', logo_url: 'httpss://eb-static.cdn.bcebos.com/logo/favicon.ico', desc: '百度旗下AI聊天助手' },
            { menu: 'Ai Stuff', title: 'Jules', url: 'httpss://jules.google.com', logo_url: 'httpss://www.gstatic.com/labs-code/code-app/favicon-48x48.png', desc: 'Google旗下AI管理github项目' },
            { menu: 'Ai Stuff', title: '硅基流动', url: 'httpss://cloud.siliconflow.cn', logo_url: 'httpss://cloud.siliconflow.cn/favicon.ico', desc: '免费的大模型API平台' },
            { menu: 'Ai Stuff', title: 'Kilo Code', url: 'httpss://kilocode.ai', logo_url: 'httpss://www.kilocode.ai/favicon.ico', desc: '亚马逊旗下AI编程工具' },
            { menu: 'Ai Stuff', title: 'Cursor', url: 'httpss://cursor.com/cn', logo_url: 'httpss://cursor.com/favicon.ico', desc: '目前很受欢迎的AI编程工具' },
            { menu: 'Ai Stuff', title: 'AI一键换脸', url: 'httpss://imgai.ai/zh', logo_url: 'httpss://imgai.ai/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'AI PPT', url: 'httpss://www.aippt.cn', logo_url: 'httpss://www.aippt.cn/_nuxt/highlight-2.Bb1q-DtW.webp', desc: '' },
            { menu: 'Ai Stuff', title: 'AI照片修复', url: 'httpss://picwish.cn/photo-enhancer', logo_url: 'httpss://qncdn.aoscdn.com/astro/picwish/_astro/favicon@30w.61721eae.png', desc: '' },
            { menu: 'Ai Stuff', title: 'Bolt', url: 'httpss://bolt.new', logo_url: 'httpss://bolt.new/static/favicon.svg', desc: 'AI前端生成' },
            { menu: 'Ai Stuff', title: 'Llamacoder', url: 'httpss://llamacoder.together.ai', logo_url: 'httpss://llamacoder.together.ai/favicon.ico', desc: 'AI生成APP' },
            { menu: 'Ai Stuff', title: 'Codia', url: 'httpss://codia.ai', logo_url: 'httpss://codia.ai/favicon.ico', desc: '截图转设计图' },
            // AI Stuff - 子菜单卡片
            { subMenu: 'AI chat', title: 'ChatGPT', url: 'httpss://chat.openai.com', logo_url: 'httpss://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { subMenu: 'AI chat', title: 'Deepseek', url: 'httpss://www.deepseek.com', logo_url: 'httpss://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            // AI Stuff - 子菜单卡片
            { subMenu: 'AI tools', title: 'ChatGPT', url: 'httpss://chat.openai.com', logo_url: 'httpss://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { subMenu: 'AI tools', title: 'Deepseek', url: 'httpss://www.deepseek.com', logo_url: 'httpss://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            // Cloud
            { menu: 'Cloud', title: '阿里云', url: 'httpss://www.aliyun.com', logo_url: 'httpss://img.alicdn.com/tfs/TB1_ZXuNcfpK1RjSZFOXXa6nFXa-32-32.ico', desc: '阿里云官网' },
            { menu: 'Cloud', title: '腾讯云', url: 'httpss://cloud.tencent.com', logo_url: '', desc: '腾讯云官网' },
            { menu: 'Cloud', title: '甲骨文云', url: 'httpss://cloud.oracle.com', logo_url: '', desc: 'Oracle Cloud' },
            { menu: 'Cloud', title: '亚马逊云', url: 'httpss://aws.amazon.com', logo_url: 'httpss://img.icons8.com/color/144/amazon-web-services.png', desc: 'Amazon AWS' },
            { menu: 'Cloud', title: 'DigitalOcean', url: 'httpss://www.digitalocean.com', logo_url: 'httpss://www.digitalocean.com/_next/static/media/apple-touch-icon.d7edaa01.png', desc: 'DigitalOcean VPS' },
            { menu: 'Cloud', title: 'Vultr', url: 'httpss://www.vultr.com', logo_url: '', desc: 'Vultr VPS' },
            { menu: 'Cloud', title: '谷歌云', url: 'httpss://cloud.google.com', logo_url: '', desc: 'Google云提供免费3个月的VPS' },
            { menu: 'Cloud', title: 'Azure', url: 'httpss://azure.microsoft.com/zh-cn/pricing/purchase-options/azure-account?icid=azurefreeaccount', logo_url: 'httpss://azure.microsoft.com/favicon.ico', desc: '微软提供免费1年的VPS' },
            { menu: 'Cloud', title: 'Cloudcone', url: 'httpss://app.cloudcone.com', logo_url: 'httpss://cloudcone.com/wp-content/uploads/2017/06/cropped-logo-2-32x32.png', desc: '10美金每年的廉价VPS' },
            { menu: 'Cloud', title: 'Dartnode', url: 'httpss://dartnode.com', logo_url: 'httpss://dartnode.com/assets/dash/images/brand/favicon.png', desc: '开源项目可申请的永久免费VPS' },
            { menu: 'Cloud', title: 'DMIT', url: 'httpss://www.dmit.io', logo_url: 'httpss://www.dmit.io/favicon.ico', desc: '优质VPS线路' },
            { menu: 'Cloud', title: 'Bandwagonhost', url: 'httpss://bandwagonhost.com', logo_url: 'httpss://cdn.nodeimage.com/i/sOjwSRMxgDFDmei6uJxngdPXTF8aeNxP.png', desc: 'CN2-GIA优质线路' },
            { menu: 'Cloud', title: 'Racknerd', url: 'httpss://my.racknerd.com/index.php?rp=/login', logo_url: 'httpss://my.racknerd.com/templates/racknerdv851/files/favicon.png', desc: '10美金每年的廉价VPS' },
            { menu: 'Cloud', title: 'Lightnode', url: 'httpss://www.lightnode.com', logo_url: '', desc: '冷门区域VPS' },
            { menu: 'Cloud', title: 'ishosting', url: 'httpss://ishosting.com/en', logo_url: 'httpss://ishosting.com/meta/landing/favicon-48x48.png', desc: '地区多的VPS' },
            { menu: 'Cloud', title: 'Diylink', url: 'httpss://console.diylink.net/login', logo_url: 'httpss://console.diylink.net/favicon.ico', desc: '套壳Google和AWS的VPS' },
            { menu: 'Cloud', title: 'IBM', url: 'httpss://linuxone.cloud.marist.edu/#/login', logo_url: '', desc: '免费4个月的VPS（需住宅IP注册）' },
            { menu: 'Cloud', title: 'Sharon', url: 'httpss://whmcs.sharon.io', logo_url: 'httpss://framerusercontent.com/images/lvXR2x1W2bqvDhYmE8IQ1jHFv3Q.png', desc: '优质3网优化线路' },
            { menu: 'Cloud', title: 'Alice', url: 'httpss://alicenetworks.net', logo_url: '', desc: '' },
            { menu: 'Cloud', title: 'Yxvm', url: 'httpss://yxvm.com', logo_url: 'httpss://cdn.nodeimage.com/i/iz5EGYyDLI5qBkNr2nTsSLxMHrqR6MSS.webp', desc: '' },
            { menu: 'Cloud', title: '华为云', url: 'httpss://www.huaweicloud.com', logo_url: 'httpss://huaweicloud.com/favicon.ico', desc: '华为提供永久免费的云开发主机' },
            // Container
            { menu: 'Container', title: 'Koyeb', url: 'httpss://app.koyeb.com/auth/signin', logo_url: 'httpss://app.koyeb.com/favicon.ico', desc: '免费容器（注册需干净IP无需绑卡）' },
            { menu: 'Container', title: 'Render', url: 'httpss://dashboard.render.com/login', logo_url: 'httpss://dashboard.render.com/favicon-light.png', desc: '免费容器（注册需干净IP无需绑卡）' },
            { menu: 'Container', title: 'Fly', url: 'httpss://fly.io', logo_url: 'httpss://fly.io/phx/ui/images/favicon/favicon-595d1312b35dfe32838befdf8505515e.ico?vsn=d', desc: '免费容器（注册需绑卡）' },
            { menu: 'Container', title: 'Northflank', url: 'httpss://app.northflank.com', logo_url: 'httpss://app.northflank.com/favicon.ico', desc: '免费容器（注册需绑卡）' },
            { menu: 'Container', title: 'Choreo', url: 'httpss://console.choreo.dev', logo_url: 'httpss://console.choreo.dev/favicon.ico', desc: '免费容器（无需绑卡）' },
            { menu: 'Container', title: 'Railway', url: 'httpss://railway.com', logo_url: 'httpss://railway.com/favicon.ico', desc: '免费1个月容器（注册需干净IP，无需绑卡，到期可注销后重复注册）' },
            { menu: 'Container', title: 'Galaxycloud', url: 'httpss://beta.galaxycloud.app', logo_url: 'httpss://beta.galaxycloud.app/favicon.ico?v2', desc: '免费容器（无需绑卡）' },
            { menu: 'Container', title: 'Azure', url: 'httpss://azure.microsoft.com/en-us/pricing/offers/ms-azr-0144p', logo_url: 'httpss://azure.microsoft.com/favicon.ico', desc: '微软免费容器（可以创建10个，az200或edu邮箱注册）' },
            { menu: 'Container', title: 'Codered', url: 'httpss://app.codered.cloud/login/?next=/hosting/webapps/app', logo_url: 'httpss://app.codered.cloud/static/core/img/favicon.png', desc: '免费Django框架容器（需isp环境注册）' },
            { menu: 'Container', title: 'Shuttle', url: 'httpss://console.shuttle.dev/login', logo_url: 'httpss://console.shuttle.dev/favicon.ico', desc: '免费的rust容器' },
            { menu: 'Container', title: 'Serv00', url: 'httpss://www.serv00.com', logo_url: '', desc: '免费的波兰容器（停止注册）' },
            { menu: 'Container', title: 'CT8', url: 'httpss://www.ct8.pl', logo_url: 'httpss://www.ct8.pl/static/ct8/img/logo.jpg', desc: 'Serv00同款（不定期开放注册）' },
            { menu: 'Container', title: 'Claw', url: 'httpss://ap-northeast-1.run.claw.cloud/signin?link=FZHSTH7HEBTU', logo_url: 'httpss://console.run.claw.cloud/favicon.ico', desc: '免费容器（半年以上Github账户每月免费5美金）' },
            { menu: 'Container', title: 'Cloudcat', url: 'httpss://cloud.cloudcat.one/signin', logo_url: 'httpss://cloud.cloudcat.one/favicon.ico', desc: 'Claw同款免费容器（每月免费5美金）' },
            { menu: 'Container', title: 'Huggingface', url: 'httpss://huggingface.co', logo_url: 'httpss://huggingface.co/favicon.ico', desc: '开源模型社区（免费的space）' },
            { menu: 'Container', title: 'Alwaysdata', url: 'httpss://admin.alwaysdata.com', logo_url: 'httpss://static.alwaysdata.com/media/reseller/1/theme/favicon_kfxZA8s.png', desc: '免费容器（干净IP注册免绑卡）' },
            { menu: 'Container', title: 'Vercel', url: 'httpss://vercel.com/login?next=%2Fdashboard', logo_url: 'httpss://vercel.com/favicon.ico', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Netlify', url: 'httpss://www.netlify.com', logo_url: 'httpss://www.netlify.com/favicon.ico', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Modal', url: 'httpss://modal.com', logo_url: 'httpss://modal.com/assets/favicon.svg', desc: '每月5美金（风控严格）' },
            { menu: 'Container', title: 'Scalingo', url: 'httpss://scalingo.com', logo_url: 'httpss://scalingo.com/favicon.ico', desc: '法国家宽容器（风控严格）' },
            { menu: 'Container', title: 'Sevalla', url: 'httpss://app.sevalla.com/login', logo_url: 'httpss://sevalla.com/favicon.ico', desc: '绑卡免费10个月（风控严格）' },
            { menu: 'Container', title: 'Phala', url: 'httpss://phala.com', logo_url: 'httpss://cloud.phala.network/favicon.ico', desc: '免费400美金（可用10个月）' },
            { menu: 'Container', title: 'Wasmer', url: 'httpss://wasmer.io', logo_url: 'httpss://wasmer.io/icons/favicon.svg', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Appwrite', url: 'httpss://cloud.appwrite.io/console/login?redirect=%2Fconsole', logo_url: 'httpss://appwrite.io/images/logos/logo.svg', desc: '免费多地区' },
            { menu: 'Container', title: 'SAP企业版', url: 'httpss://accounts.sap.com/oauth2/authorize?response_type=code&scope=openid+email+profile&redirect_uri=httpss%3A%2F%2Femea.cockpit.btp.cloud.sap%2Flogin%2Fcallback&client_id=28f1d77a-ce0d-401a-b926-e393cd8ed4fa&state=9onZatYlhx7G8ysrhQCS2A&code_challenge=t5Mp-sF2akcbj7d9vJLRFY8dnUJleGusmN8AOdqMiNE&code_challenge_method=S256', logo_url: 'httpss://accounts.sap.com/ui/public/cached/tenant/v/1/favicon', desc: 'SAP企业版登陆入口' },
            { menu: 'Container', title: 'SAP试用版', url: 'httpss://accounts.sap.com/oauth2/authorize?response_type=code&scope=openid+email+profile&redirect_uri=httpss%3A%2F%2Faccount.hanatrial.ondemand.com%2Flogin%2Fcallback&client_id=9868c363-bc2d-407f-bc14-2ef649230f6f&state=YQ1WSkMxiGFIE5SS8CTlug&code_challenge=a79-P3ArHzigPFsJ2NgF7C6MHim31qOTGvlaGFKWEsg&code_challenge_method=S256', logo_url: 'httpss://accounts.sap.com/ui/public/cached/tenant/v/1/favicon', desc: 'SAP试用版登陆入口' },
            { menu: 'Container', title: 'Leaflow', url: 'httpss://leaflow.net/login', logo_url: 'httpss://leaflow.net/build/assets/Logo-COIKldAv.png', desc: '免费香港容器（签到可长期使用）' },
            { menu: 'Container', title: 'Zeabur', url: 'httpss://zeabur.com/zh-CN/login', logo_url: 'httpss://dash.zeabur.com/favicon.ico', desc: '免费容器（每月免费5美金）' },
            { menu: 'Container', title: 'Databricks', url: 'httpss://www.databricks.com', logo_url: '', desc: 'APP' },
            { menu: 'Container', title: 'idx', url: 'httpss://idx.google.com', logo_url: 'httpss://www.gstatic.com/monospace/250314/macos-icon-192.png', desc: 'Google IDX' },
            // Container - Game Server 子菜单卡片
            { subMenu: 'Game Server', title: 'Adkynet', url: 'httpss://manager.adkynet.com/login', logo_url: 'httpss://www.adkynet.com/favicon.png', desc: '稳定的node/java/python容器（1月1续）' },
            { subMenu: 'Game Server', title: 'Axsoter', url: 'httpss://free.axsoter.com', logo_url: 'httpss://www.axsoter.com/assets/img/icon.webp', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Crosmo', url: 'httpss://host.crosmo.de', logo_url: '', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Flexynode', url: 'httpss://flexynode.com', logo_url: 'httpss://448d564e-e592-4849-b808-2fdf2cb6c5b1.svc.edge.scw.cloud/website/img/2.webp', desc: '64M nodejs/python玩具' },
            { subMenu: 'Game Server', title: 'Boxmineworld', url: 'httpss://dash.boxmineworld.com/login', logo_url: 'httpss://boxmineworld.com/images/favicon.png', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Wispbyte', url: 'httpss://wispbyte.com', logo_url: 'httpss://wispbyte.com/assets/wispbyte_blue_nobg.webp', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Searcade', url: 'httpss://searcade.com/en', logo_url: 'httpss://448d564e-e592-4849-b808-2fdf2cb6c5b1.svc.edge.scw.cloud/website/img/2.webp', desc: '每10天需登陆1次' },
            { subMenu: 'Game Server', title: 'Echohost', url: 'httpss://client.echohost.org/login', logo_url: 'httpss://client.echohost.org/storage/favicon.ico', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Embotic', url: 'httpss://dash.embotic.xyz', logo_url: '', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Zenix', url: 'httpss://panel.zenix.sg', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Waifly', url: 'httpss://dash.waifly.com', logo_url: 'httpss://waifly.com/images/favicon.png', desc: '' },
            { subMenu: 'Game Server', title: 'Karlo', url: 'httpss://karlo-hosting.com', logo_url: 'httpss://karlo-hosting.com/favicon.ico', desc: '' },
            { subMenu: 'Game Server', title: 'Solar', url: 'httpss://account.solarhosting.cc/login', logo_url: 'httpss://account.solarhosting.cc/storage/favicon.ico', desc: '' },
            { subMenu: 'Game Server', title: 'Berrynodes', url: 'httpss://dash.berrynodes.com', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Spaceify', url: 'httpss://client.spaceify.eu', logo_url: 'httpss://client.spaceify.eu/storage/logo.png', desc: '易风控' },
            { subMenu: 'Game Server', title: 'Freeserver', url: 'httpss://dash.freeserver.tw/auth/login', logo_url: 'httpss://dash.freeserver.tw/assets/freeserverv3.bb434095.png', desc: '台湾游戏机' },
            { subMenu: 'Game Server', title: 'Bot-hosting', url: 'httpss://bot-hosting.net', logo_url: '', desc: '需要赚金币续费' },
            { subMenu: 'Game Server', title: 'Atomic', url: 'httpss://panel.atomicnetworks.co', logo_url: 'httpss://cdn.wisp.gg/uploaded_assets/panel.atomicnetworks.co/c1146e9e03bfc07d80b4714ff0d3bc43a3cf071c2fdda161dd49dcd831fbecd8.png', desc: '稳定多年的游戏机' },
            { subMenu: 'Game Server', title: 'Boxmineworld', url: 'httpss://dash.boxmineworld.com/login', logo_url: 'httpss://dash.boxmineworld.com/favicon.ico', desc: '稳定的美国游戏机' },
            { subMenu: 'Game Server', title: 'Zampto', url: 'httpss://hosting.zampto.net/auth', logo_url: 'httpss://zampto.net/assets/img/logo-icon-gradient.png', desc: '意大利游戏机' },
            { subMenu: 'Game Server', title: 'Altr', url: 'httpss://console.altr.cc/dashboard', logo_url: 'httpss://i.imgur.com/EZep3AC.png', desc: '多地区游戏机' },
            { subMenu: 'Game Server', title: 'Skybots', url: 'httpss://skybots.tech/fr/#google_vignette', logo_url: '', desc: '法国ISP-nodejs玩具' },
            { subMenu: 'Game Server', title: 'Greathost', url: 'httpss://greathost.es/login', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Lunes', url: 'httpss://betadash.lunes.host/login?next=/', logo_url: '', desc: '' },
            // Software
            { menu: 'Software', title: 'Hellowindows', url: 'httpss://hellowindows.cn', logo_url: 'httpss://hellowindows.cn/logo-s.png', desc: 'windows系统及office下载' },
            { menu: 'Software', title: '奇迹秀', url: 'httpss://www.qijishow.com/down', logo_url: 'httpss://www.qijishow.com/img/ico.ico', desc: '设计师的百宝箱' },
            { menu: 'Software', title: '易破解', url: 'httpss://www.ypojie.com', logo_url: 'httpss://www.ypojie.com/favicon.ico', desc: '精品windows软件' },
            { menu: 'Software', title: 'Cracked Software', url: 'httpss://topcracked.com', logo_url: 'httpss://cdn.mac89.com/win_macxf_node/static/favicon.ico', desc: 'windows破解软件' },
            { menu: 'Software', title: 'ZTasker', url: 'httpss://www.everauto.net', logo_url: 'httpss://www.everauto.net/images/App32.png', desc: '定时/热键/事件/键鼠模拟/操作录制/自动化流程' },
            { menu: 'Software', title: '云萌Win10/11激活', url: 'httpss://cmwtat.cloudmoe.com/cn.html', logo_url: 'httpss://img.icons8.com/color/96/windows-10.png', desc: 'windows系统激活工具' },
            { menu: 'Software', title: 'Zen-browser', url: 'httpss://zen-browser.app', logo_url: '', desc: '超好用的一款浏览器' },
            { menu: 'Software', title: 'Adspower', url: 'httpss://activity.adspower.com/ap/dist/', logo_url: 'httpss://activity.adspower.com/ap/dist/favicon.ico', desc: '指纹浏览器（3个免费环境）' },
            { menu: 'Software', title: 'Hubstudio', url: 'httpss://www.hubstudio.cn', logo_url: 'httpss://www.hubstudio.cn/_next/static/images/logo-white-43c86335b0f59ef4cdba7f4c7009fea4.png', desc: '指纹浏览器（每天20次免费）' },
            { menu: 'Software', title: 'incogniton', url: 'httpss://incogniton.com/zh-hans', logo_url: 'httpss://incogniton.com/favicon.ico', desc: '指纹浏览器（10个免费环境）' },
            { menu: 'Software', title: 'Termora', url: 'httpss://www.termora.app/downloads', logo_url: 'httpss://www.termora.app/favicon.ico', desc: '简约好用的SSH软件' },
            { menu: 'Software', title: 'Cherry Studio', url: 'httpss://www.cherry-ai.com', logo_url: 'httpss://www.cherry-ai.com/assets/favicon-BmbgeFTf.png', desc: 'AI对话客户端' },
            { menu: 'Software', title: 'MusicFree', url: 'httpss://musicfree.catcat.work', logo_url: 'httpss://musicfree.catcat.work/favicon.ico', desc: '免费开源的音乐播放器' },
            { menu: 'Software', title: 'LXmusic', url: 'httpss://lxmusic.toside.cn', logo_url: 'httpss://lxmusic.toside.cn/img/logo.svg', desc: '免费开源的音乐播放器' },
            { menu: 'Software', title: 'UU远程', url: 'httpss://uuyc.163.com', logo_url: 'httpss://uuyc.163.com/favicon.ico', desc: '游戏级远控制（网易出品）' },
            { menu: 'Software', title: 'QtScrcpy', url: 'httpss://github.com/barry-ran/QtScrcpy/releases/tag/v3.3.3', logo_url: 'httpss://img.icons8.com/color/96/android-os.png', desc: '免费开源的安卓投屏软件' },
            { menu: 'Software', title: '小丸工具箱', url: 'httpss://maruko.appinn.me', logo_url: 'httpss://maruko.appinn.me/favicon.ico', desc: '非常好用的视频音频压缩软件' },
            { menu: 'Software', title: 'Beekeeper Studio', url: 'httpss://www.beekeeperstudio.io/', logo_url: 'httpss://www.beekeeperstudio.io/favicon.ico', desc: '免费开源的数据库管理软件' },
            { menu: 'Software', title: 'Navicat Premium', url: 'httpss://pan.baidu.com/s/1HjfAn71Vgp-TeoY755TZOw?pwd=mc73', logo_url: 'httpss://www.navicat.com.cn/images/Navicat_16_Premium_win_256x256.ico', desc: '头部数据库管理软件（此链接破解版）' },
            { menu: 'Software', title: 'Geek Uninstaller', url: 'httpss://geekuninstaller.com/download', logo_url: 'httpss://geekuninstaller.com/favicon.ico', desc: '小巧轻便的卸载软件' },
            { menu: 'Software', title: 'Pixpin', url: 'httpss://pixpin.cn', logo_url: 'httpss://pixpin.cn/favicon.ico', desc: '非常不错的截图软件' },
            { menu: 'Software', title: 'Mem Reduct', url: 'httpss://github.com/henrypp/memreduct/releases/tag/v.3.5.2', logo_url: 'httpss://img.icons8.com/pulsar-gradient/48/memory-slot.png', desc: '内存自动清理' },
            { menu: 'Software', title: 'phpstudy', url: 'httpss://www.xp.cn/phpstudy', logo_url: 'httpss://www.xp.cn/favicon.ico', desc: '本地服务器环境管理' },
            { menu: 'Software', title: 'Requestly', url: 'httpss://requestly.com', logo_url: 'httpss://requestly.com/favicon.ico', desc: 'API测试/抓包' },
            { menu: 'Software', title: 'Raylink', url: 'httpss://www.raylink.live', logo_url: '', desc: '远程控制' },
            // Software - Proxy 子菜单卡片
            { subMenu: 'Proxy', title: 'V2rayN', url: 'httpss://v2rayn.2dust.link/', logo_url: 'httpss://images.sftcdn.net/images/t_app-icon-m/p/a2c8f10a-f0e8-460b-a03c-d17953176ab8/2246704787/v2rayn-v2rayN-icon.png', desc: '最受欢迎的代理软件' },
            { subMenu: 'Proxy', title: 'Mihomo Party', url: 'httpss://clashparty.org', logo_url: 'httpss://mihomo.party/favicon.ico', desc: 'Mihomo内核最受欢迎的代理软件' },
            { subMenu: 'Proxy', title: 'GUI.for.SingBox', url: 'httpss://github.com/GUI-for-Cores/GUI.for.SingBox/releases/tag/v1.14.0', logo_url: 'httpss://sing-box.sagernet.org/assets/icon.svg', desc: '第三方开源SingBox代理工具' },
            { subMenu: 'Proxy', title: 'FlClash', url: 'httpss://github.com/chen08209/FlClash/releases/tag/v0.8.90', logo_url: 'data:image/png;base64,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', desc: 'Clash系列人气代理软件' },
            { subMenu: 'Proxy', title: 'Karing', url: 'httpss://karing.app/download', logo_url: 'httpss://karing.app/img/favicon.ico', desc: '新一代全能型代理软件（适配多系统）' },
            { subMenu: 'Proxy', title: 'Nekobox', url: 'httpss://nekobox.tools/nekoray', logo_url: 'httpss://nekobox.tools/favicon.ico', desc: 'windows版本停止维护，谨慎使用' },
            { subMenu: 'Proxy', title: 'FlyClash', url: 'httpss://github.com/GtxFury/FlyClash/releases/tag/v0.1.7', logo_url: 'httpss://raw.githubusercontent.com/GtxFury/FlyClash/main/public/logo.png', desc: 'Mihomo内核新一代代理软件' },
            { subMenu: 'Proxy', title: 'ClashBox', url: 'httpss://github.com/xiaobaigroup/ClashBox', logo_url: 'httpss://clash.top/wp-content/uploads/2024/01/Clash.png', desc: 'HarmonyOS NEXT的代理软件' },
            // Software - Macos 子菜单卡片
            { subMenu: 'Macos', title: 'Macwk', url: 'httpss://www.macwk.com', logo_url: 'httpss://www.macwk.com/favicon-32x32.ico', desc: '精品Mac软件' },
            { subMenu: 'Macos', title: 'Macsc', url: 'httpss://mac.macsc.com', logo_url: 'httpss://cdn.mac89.com/macsc_node/static/favicon.ico', desc: '' },
            // Tools
            { menu: 'Tools', title: 'Argo Tunnel json获取', url: 'httpss://fscarmen.cloudflare.now.cc', logo_url: 'data:image/svg+xml,<svg xmlns='https://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><defs><linearGradient id='grad1' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:%23ff5722; stop-opacity:1' /><stop offset='100%' style='stop-color:%23ff9800; stop-opacity:1' /></linearGradient><filter id='shadow' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur in='SourceAlpha' stdDeviation='8' /><feOffset dx='5' dy='5' result='offsetblur' /><feFlood flood-color='rgba(0, 0, 0, 0.6)' /><feComposite in2='offsetblur' operator='in' /><feMerge><feMergeNode /><feMergeNode in='SourceGraphic' /></feMerge></filter></defs><rect width='100%' height='100%' fill='%23f5f5f5' /><text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle' font-family='Arial, sans-serif' font-size='180px' fill='url(%23grad1)' font-weight='bold' filter='url(%23shadow)'>J</text></svg>', desc: 'cloudflared Argo Tunnel固定隧道json获取' },
            { menu: 'Tools', title: 'base64工具', url: 'httpss://www.qqxiuzi.cn/bianma/base64.htm', logo_url: 'httpss://cdn.base64decode.org/assets/images/b64-180.webp', desc: '在线base64编码解码' },
            { menu: 'Tools', title: '二维码生成', url: 'httpss://cli.im', logo_url: 'httpss://img.icons8.com/fluency/96/qr-code.png', desc: '二维码生成工具' },
            { menu: 'Tools', title: 'JS混淆', url: 'httpss://obfuscator.io', logo_url: 'httpss://img.icons8.com/color/240/javascript--v1.png', desc: '在线Javascript代码混淆' },
            { menu: 'Tools', title: 'Python混淆', url: 'httpss://freecodingtools.org/tools/obfuscator/python', logo_url: 'httpss://img.icons8.com/color/240/python--v1.png', desc: '在线python代码混淆' },
            { menu: 'Tools', title: 'Remove.photos', url: 'httpss://remove.photos/zh-cn', logo_url: 'httpss://img.icons8.com/doodle/192/picture.png', desc: '一键抠图' },
            { menu: 'Tools', title: 'Pagespeed', url: 'httpss://pagespeed.web.dev', logo_url: 'httpss://www.gstatic.com/pagespeed/insights/ui/logo/favicon_48.png', desc: '' },
            { menu: 'Tools', title: '自动访问', url: 'httpss://matte.ct8.pl', logo_url: 'httpss://img.icons8.com/dusk/100/globe.png', desc: '自动访问保活管理系统' },
            { menu: 'Tools', title: 'Cron-job', url: 'httpss://console.cron-job.org/login', logo_url: 'httpss://console.cron-job.org/logo192.png', desc: '定时自动访问网页' },
            { menu: 'Tools', title: '网址缩短', url: 'httpss://short.ssss.nyc.mn', logo_url: 'httpss://short.ssss.nyc.mn/asset/img/favicon.png', desc: '' },
            { menu: 'Tools', title: 'Linuxmirrors', url: 'httpss://linuxmirrors.cn', logo_url: 'httpss://linuxmirrors.cn/assets/images/brand/svg/logo-light.svg', desc: '' },
            { menu: 'Tools', title: 'Vocal Remover', url: 'httpss://vocalremover.org', logo_url: 'httpss://vocalremover.org/favicon.ico', desc: '声音分离' },
            { menu: 'Tools', title: 'JSON工具', url: 'httpss://www.json.cn', logo_url: 'httpss://img.icons8.com/nolan/128/json.png', desc: 'JSON格式化/校验' },
            { menu: 'Tools', title: '文件格式转换', url: 'httpss://convertio.co/zh', logo_url: 'httpss://convertio.co/favicon.ico', desc: '超300种文件格式转换' },
            { menu: 'Tools', title: '视频在线下载', url: 'httpss://tubedown.cn/youtube', logo_url: 'httpss://tubedown.cn/favicon.ico', desc: '在线视频解析下载' },
            { menu: 'Tools', title: 'emoji表情大全', url: 'httpss://www.iamwawa.cn/emoji.html', logo_url: 'httpss://www.iamwawa.cn/favicon.ico', desc: '各类目emoji' },
            { menu: 'Tools', title: '信用卡生成', url: 'httpss://bincheck.io/zh/credit-card-generator', logo_url: '', desc: '信用卡生成器' },
            { menu: 'Tools', title: 'Squoosh', url: 'httpss://squoosh.app', logo_url: 'httpss://squoosh.app/c/icon-large-maskable-c2078ced.png', desc: '图片无损压缩' },
            { menu: 'Tools', title: 'Tool小工具', url: 'httpss://tool.lu', logo_url: 'httpss://tool.lu/favicon.ico', desc: '小工具' },
            { menu: 'Tools', title: 'D1tools', url: 'httpss://d1tools.com', logo_url: 'httpss://d1tools.com/favicon.ico', desc: '' },
            { menu: 'Tools', title: 'Lumiproxy', url: 'httpss://www.lumiproxy.com/zh-hans/online-proxy/proxysite', logo_url: 'httpss://www.lumiproxy.com/favicon.ico', desc: '在线网页住宅代理' },
            { menu: 'Tools', title: 'Proxyshare', url: 'httpss://www.proxyshare.com/zh/proxysite', logo_url: 'httpss://www.proxyshare.com/favicon.ico', desc: '在线网页住宅代理' },
            { menu: 'Tools', title: 'Dnsleaktest', url: 'httpss://dnsleaktest.com', logo_url: 'httpss://dnsleaktest.com/assets/favicon.ico', desc: 'DNS泄露检测' },
            { menu: 'Tools', title: 'Deobfuscator', url: 'httpss://raz1ner.com/Online-Tools/JavaScript-Deobfuscator.html', logo_url: 'httpss://dev-coco.github.io/favicon.ico', desc: 'JS反混淆' },
            { menu: 'Tools', title: 'Flexclip', url: 'httpss://www.flexclip.com/cn/ai/', logo_url: 'httpss://www.flexclip.com/favicon.ico', desc: '' },
            { menu: 'Tools', title: '星空音乐下载', url: 'httpss://www.vh.hk/', logo_url: 'httpss://www.vh.hk/favicon.ico', desc: '' },
            { menu: 'Tools', title: 'Blackace', url: 'httpss://blackace.app', logo_url: 'httpss://blackace.app/imgs/favicon.ico', desc: '网站打包成APP' },
            { menu: 'Tools', title: 'PHP混淆加密', url: 'httpss://www.toolnb.com/tools/phpcarbylamine.html', logo_url: '', desc: '' },
            { menu: 'Tools', title: '中文转码', url: 'httpss://www.bchrt.com/tools/punycode-encoder', logo_url: '', desc: '' },
            // Tools - Free SMS 子菜单卡片
            { subMenu: 'Free SMS', title: 'smser', url: 'httpss://smser.net', logo_url: 'httpss://smser.net/img/smser.net/favicon-32x32.png', desc: '' },
            { subMenu: 'Free SMS', title: 'freereceivesms', url: 'httpss://www.freereceivesms.com', logo_url: '', desc: '' },
            { subMenu: 'Free SMS', title: 'sms24', url: 'httpss://sms24.me/en', logo_url: 'httpss://sms24.me/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'onlinesim', url: 'httpss://onlinesim.io/ru', logo_url: 'httpss://onlinesim.io/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'smsonline', url: 'httpss://www.smsonline.cloud/zh#google_vignette', logo_url: 'httpss://www.smsonline.cloud/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receive-sms', url: 'httpss://wetalkapp.com/receive-sms', logo_url: 'httpss://wetalkapp.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'supercloudsms', url: 'httpss://www.supercloudsms.com/country/usa/1.html', logo_url: '', desc: '' },
            { subMenu: 'Free SMS', title: 'freephonenum', url: 'httpss://freephonenum.com', logo_url: '', desc: '只有美国和加拿大号码' },
            { subMenu: 'Free SMS', title: 'lubansms', url: 'httpss://lubansms.com/receiveSms', logo_url: 'httpss://lubansms.com/img/apple-touch-icon.png', desc: '' },
            { subMenu: 'Free SMS', title: '7sim', url: 'httpss://7sim.net', logo_url: 'https://7sim.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receiveasms', url: 'httpss://www.receiveasms.com', logo_url: 'httpss://www.receiveasms.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivesmsonline', url: 'httpss://www.receivesmsonline.net', logo_url: 'httpss://www.receivesmsonline.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-online', url: 'httpss://sms-online.co/receive-free-sms', logo_url: 'httpss://sms-online.co/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivefreesms', url: 'httpss://receivefreesms.net', logo_url: 'httpss://receivefreesms.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivesmsonline', url: 'httpss://receivesmsonline.in/number', logo_url: 'httpss://receivesmsonline.in/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-receive', url: 'httpss://sms-receive.net', logo_url: 'httpss://sms-receive.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'jiemahao', url: 'httpss://jiemahao.com', logo_url: 'httpss://jiemahao.com/favicon.ico', desc: '接号码' },
            { subMenu: 'Free SMS', title: 'bestsms', url: 'httpss://bestsms.xyz', logo_url: 'httpss://bestsms.xyz/static/yunji/imgs/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'zusms', url: 'httpss://www.zusms.com', logo_url: 'httpss://www.zusms.com/favicon.ico', desc: '有云短信' },
            { subMenu: 'Free SMS', title: 'mytrashmobile', url: 'httpss://zh.mytrashmobile.com/numbers', logo_url: 'httpss://static.mytrashmobile.com/assets/images/icons/favicons/apple-icon-60x60.png', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-japan', url: 'httpss://sms-japan.com', logo_url: 'httpss://sms-japan.com/static/smsjapan/images/favicon.png', desc: '' },
            { subMenu: 'Free SMS', title: 'online-sim', url: 'httpss://online-sim.pro/zh', logo_url: 'httpss://online-sim.pro/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'temp-number', url: 'httpss://temp-number.com', logo_url: 'httpss://temp-number.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'tiger-sms', url: 'httpss://tiger-sms.com/free', logo_url: 'httpss://tiger-sms.shop/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'clearcode', url: 'httpss://clearcode.cn', logo_url: 'httpss://clearcode.cn/static/tw/favicon.ico?v=2', desc: '中国号码' },
            { subMenu: 'Free SMS', title: 'tempsmss', url: 'httpss://tempsmss.com', logo_url: 'httpss://tempsmss.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'free-numbers', url: 'httpss://sms-verification-number.com/free-numbers-cn/#activity', logo_url: 'httpss://sms-verification-number.com/frontend/assets/img/logo.svg', desc: '' },
            { subMenu: 'Free SMS', title: 'mianfeijiema', url: 'httpss://www.mianfeijiema.com/#google_vignette', logo_url: 'httpss://www.mianfeijiema.com/static/picture/logo.png', desc: '' },
            { subMenu: 'Free SMS', title: 'receive-smss', url: 'httpss://receive-smss.com', logo_url: 'httpss://receive-smss.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-man', url: 'httpss://sms-man.com/cn/free-numbers', logo_url: 'httpss://sms-man.com/favicon.ico', desc: '' },
            // Mail or Domain
            { menu: 'Mail or Domain', title: 'Gmail', url: 'httpss://mail.google.com', logo_url: 'httpss://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: 'Google邮箱' },
            { menu: 'Mail or Domain', title: 'Outlook', url: 'httpss://outlook.live.com', logo_url: 'httpss://img.icons8.com/color/256/ms-outlook.png', desc: '微软Outlook邮箱' },
            { menu: 'Mail or Domain', title: 'Proton Mail', url: 'httpss://account.proton.me', logo_url: 'httpss://account.proton.me/assets/apple-touch-icon-120x120.png', desc: '安全加密邮箱' },
            { menu: 'Mail or Domain', title: 'QQ邮箱', url: 'httpss://mail.qq.com', logo_url: 'httpss://mail.qq.com/zh_CN/htmledition/images/favicon/qqmail_favicon_96h.png', desc: '腾讯QQ邮箱' },
            { menu: 'Mail or Domain', title: '雅虎邮箱', url: 'httpss://mail.yahoo.com', logo_url: 'httpss://img.icons8.com/color/240/yahoo--v2.png', desc: '雅虎邮箱' },
            { menu: 'Mail or Domain', title: '10分钟临时邮箱', url: 'httpss://linshiyouxiang.net', logo_url: 'httpss://linshiyouxiang.net/static/index/zh/images/favicon.ico', desc: '10分钟临时邮箱' },
            { menu: 'Mail or Domain', title: '临时域名邮箱', url: 'httpss://email.zrvvv.com', logo_url: 'httpss://email.zrvvv.com/logo.png', desc: '临时域名邮箱（可重复收件或发件）' },
            { menu: 'Mail or Domain', title: '2925无限邮箱', url: 'httpss://www.2925.com/login', logo_url: 'httpss://www.2925.com/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: '风车临时邮箱', url: 'httpss://mail.xoxome.online/login', logo_url: '', desc: '可长期使用的临时邮箱' },
            { menu: 'Mail or Domain', title: '88完美邮箱', url: 'httpss://www.88.com/?back=httpss%3A%2F%2Fmail.88.com%2Fmail%2F%23%2Fhome#/', logo_url: 'data:image/png;base64,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', desc: '' },
            { menu: 'Mail or Domain', title: '临时edu邮箱', url: 'httpss://tempmail.edu.kg', logo_url: 'httpss://tempmail.edu.kg/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: 'Tempmail', url: 'httpss://tempmail.plus/zh/#!', logo_url: 'httpss://tempmail.plus/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: '临时邮箱', url: 'httpss://22.do/zh', logo_url: 'httpss://22.do/assets/images/logo.png', desc: '' },
            { menu: 'Mail or Domain', title: 'nyc.mn域名', url: 'httpss://dot.nyc.mn/my-domain', logo_url: 'httpss://dot.nyc.mn/wp-content/uploads/2024/09/nycmnicon-150x150.png', desc: '免费2级域名（已取消免费）' },
            { menu: 'Mail or Domain', title: 'HiDNS', url: 'httpss://www.hidoha.net', logo_url: 'httpss://www.hidoha.net/themes/huraga/assets/favicon.ico', desc: '免费2级域名（邀请注册）' },
            { menu: 'Mail or Domain', title: 'US.KG', url: 'httpss://dash.domain.digitalplat.org/auth/login?next=%2F', logo_url: '', desc: '免费2级域名（dpdns.org/us.kg/xx.kg）' },
            { menu: 'Mail or Domain', title: 'l53', url: 'httpss://customer.l53.net', logo_url: 'httpss://customer.l53.net/favicon.ico', desc: 'ggff.net免费2级域名' },
            { menu: 'Mail or Domain', title: 'mffac临时邮箱', url: 'httpss://www.mffac.com', logo_url: 'httpss://www.mffac.com/favicon.ico', desc: 'mffac临时邮箱' },
            { menu: 'Mail or Domain', title: 'zabc.net', url: 'httpss://zoneabc.net/login?redirect=/dashboard', logo_url: 'httpss://zoneabc.net/logo.svg', desc: '免费2级域名（不可托管CF）' },
            { menu: 'Mail or Domain', title: 'eu.org', url: 'httpss://nic.eu.org', logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAbCAMAAAAqGX2oAAABHVBMVEX////+/v7y8vrJyfuysvu5ufXb2+zz8/Ph4f3V1fD29vbn5/7b2/1LS/4AAP8JCfInJ/ybm9Lj4+P9/f2dnfxVVdLGxsZERN+9vb35+flTU/4hIaJoaG2CgqgdHfeenqwhIcasrKwVFdeamprU1P1NTXe6usl3d/BWVrDb29sTE/8pKbqVlfjAwPYqKphYWKdoaJNgYHvDw9rR0dHu7u5qavc6OuGsrNdBQf6UlLRiYtArK/O6uvu1tbVYWOs0NJeUlJTo6PRDQ7UVFeOYmLBubqZ4eH2AgJFiYv6RkcNra+gTE8ZHR4pTU8OKivs6Oo9OTls1NXuFhfxHR3MwMLZJSaiJidS+vuQtLdx5ebpyco9wcPp/f961tc8vL8rqBA7bAAAB0ElEQVR4AX2R1YLbMBREpTB1lOpmXcthjkMLXmZmZv7/z6i8crneebl0RCMWiLPPFInG4okkZ6loOsOz0bRO/1DuCwTyXyUVMGFRDN9s9ed6B8VSOV+pJguo1VUMjWbmD6AF0e4kuui5IUAcQL/fx8Ae/h8YQYwntaasECAHTFvuzIw3W/BnXQNkWz8fk5nD/MJoUSzJOLA8XDHAKubXgo14Yh2A2Nic3dJJYzsA+jubSWak3N29qf26JHKXpvbXqge+DxETjCgp5WyG62RWzqqkSU0wUqlWbktxRtlsMtL6sDqSy81uZbfMHqlDAIva6shK/8iBb3VWh/Xj/rJHxuqT0zOI3Vk6hBC1wXY9cw5xMaG9WyNj9aXtOtj2qIv+1aZtyUge46bnBMAqdvZn6Rq1NXWNxr4k4tk+bjw6D4AY9It1VatrYFD376WBtvsTiELoHeZ0pYFb++Naedx5GScAIos4m4n3+zcW/QB0Urk/FwFADyvooz/enP0J8IQD1B4DgGU6T3e96aYknt571i/XUt7S8+Y6bg3A1KzrySTpRErzg7GXVyuxiAuLmBHn7A+1KnAW0ShJFqLM2/L7+92+pVgo4VraUcXCxYnIj98B87hF++6opGsAAAAASUVORK5CYII=', desc: '免费2级域名（已停止注册）' },
            { menu: 'Mail or Domain', title: 'zone.id', url: 'httpss://autz.org/onboarding/qinw2ix?callback_url=httpss%3A%2F%2Fmy.zone.id%2Fsubdomains', logo_url: 'httpss://autz.org/uploads/a8ia2qkiq.webp', desc: '免费2级域名（不可托管CF）' },
            { menu: 'Mail or Domain', title: 'Spaceship', url: 'httpss://www.spaceship.com', logo_url: 'httpss://spaceship-cdn.com/static/spaceship/favicon/spaceship-icon.svg', desc: 'xyz实惠的域名服务商' },
            { menu: 'Mail or Domain', title: 'Dynadot', url: 'httpss://www.dynadot.com/zh', logo_url: 'httpss://www.dynadot.com/favicon.ico', desc: '经常送免费域名（续费较贵）' },
            { menu: 'Mail or Domain', title: 'Godaddy', url: 'httpss://www.godaddy.com/zh', logo_url: 'httpss://img6.wsimg.com/ux-assets/favicon/favicon-32x32.png', desc: '全球最大的域名服务商（域名较贵）' },
            { menu: 'Mail or Domain', title: 'Namesilo', url: 'httpss://www.namesilo.com', logo_url: 'httpss://www.namesilo.com/favicon.ico', desc: '非常实惠的域名' },
            // Other
            { menu: 'Other', title: 'Gmail', url: 'httpss://mail.google.com', logo_url: 'httpss://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: 'Google邮箱' },
            { menu: 'Other', title: 'Outlook', url: 'httpss://outlook.live.com', logo_url: 'httpss://img.icons8.com/color/256/ms-outlook.png', desc: '微软Outlook邮箱' },
            { menu: 'Other', title: 'Proton Mail', url: 'httpss://account.proton.me', logo_url: 'httpss://account.proton.me/assets/apple-touch-icon-120x120.png', desc: '安全加密邮箱' },
            { menu: 'Other', title: 'QQ邮箱', url: 'httpss://mail.qq.com', logo_url: 'httpss://mail.qq.com/zh_CN/htmledition/images/favicon/qqmail_favicon_96h.png', desc: '腾讯QQ邮箱' },
            { menu: 'Other', title: '雅虎邮箱', url: 'httpss://mail.yahoo.com', logo_url: 'httpss://img.icons8.com/color/240/yahoo--v2.png', desc: '雅虎邮箱' },
            { menu: 'Other', title: '10分钟临时邮箱', url: 'httpss://linshiyouxiang.net', logo_url: 'httpss://linshiyouxiang.net/static/index/zh/images/favicon.ico', desc: '10分钟临时邮箱' },
          ];
          
          const cardStmt = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc) VALUES (?, ?, ?, ?, ?, ?)');
          let cardInsertCount = 0;
          
          cards.forEach(card => {
            if (card.subMenu) {
              // 插入子菜单卡片
              // 查找对应的子菜单ID，需要遍历所有可能的父菜单
              let subMenuId = null;
              for (const [key, id] of Object.entries(subMenuMap)) {
                if (key.endsWith(`_${card.subMenu}`)) {
                  subMenuId = id;
                  break;
                }
              }
              
              if (subMenuId) {
                cardStmt.run(null, subMenuId, card.title, card.url, card.logo_url, card.desc, function(err) {
                  if (err) {
                    console.error(`插入子菜单卡片失败 [${card.subMenu}] ${card.title}:`, err);
                  } else {
                    cardInsertCount++;
                    console.log(`成功插入子菜单卡片 [${card.subMenu}] ${card.title}`);
                  }
                });
              } else {
                console.warn(`未找到子菜单: ${card.subMenu}`);
              }
            } else if (menuMap[card.menu]) {
              // 插入主菜单卡片
              cardStmt.run(menuMap[card.menu], null, card.title, card.url, card.logo_url, card.desc, function(err) {
                if (err) {
                  console.error(`插入卡片失败 [${card.menu}] ${card.title}:`, err);
                } else {
                  cardInsertCount++;
                  console.log(`成功插入卡片 [${card.menu}] ${card.title}`);
                }
              });
            } else {
              console.warn(`未找到菜单: ${card.menu}`);
            }
          });
          
          cardStmt.finalize(() => {
            console.log(`所有卡片插入完成，总计: ${cardInsertCount} 张卡片`);
          });
        });
      } else {
        console.log('未找到任何菜单');
      }
    });
  }

  // 插入默认管理员账号
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (row && row.count === 0) {
      const passwordHash = bcrypt.hashSync(config.admin.password, 10);
      db.run('INSERT INTO users (username, password) VALUES (?, ?)', [config.admin.username, passwordHash]);
    }
  });

  // 插入默认友情链接
  db.get('SELECT COUNT(*) as count FROM friends', (err, row) => {
    if (row && row.count === 0) {
      const defaultFriends = [
        ['Noodseek图床', 'https://www.nodeimage.com', 'https://www.nodeseek.com/static/image/favicon/favicon-32x32.png'],
        ['Font Awesome', 'https://fontawesome.com', 'https://fontawesome.com/favicon.ico']
      ];
      const stmt = db.prepare('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)');
      defaultFriends.forEach(([title, url, logo]) => stmt.run(title, url, logo));
      stmt.finalize();
    }
  });

  db.run(`ALTER TABLE users ADD COLUMN last_login_time TEXT`, [], () => {});
  db.run(`ALTER TABLE users ADD COLUMN last_login_ip TEXT`, [], () => {});
});


module.exports = db; 



