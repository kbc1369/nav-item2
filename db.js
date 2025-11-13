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
            { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', logo_url: '', desc: '全球最大的中文搜索引擎'  },
            { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', logo_url: 'https://img.icons8.com/ios-filled/100/ff1d06/youtube-play.png', desc: '全球最大的视频社区'  },
            { menu: 'Home', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: ''  },
            { menu: 'Home', title: 'GitHub', url: 'https://github.com', logo_url: '', desc: '全球最大的代码托管平台'  },
            { menu: 'Home', title: 'ip.sb', url: 'https://ip.sb', logo_url: '', desc: 'ip地址查询'  },
            { menu: 'Home', title: 'Cloudflare', url: 'https://dash.cloudflare.com', logo_url: '', desc: '全球最大的cdn服务商'  },
            { menu: 'Home', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: '人工智能AI聊天机器人'  },
            { menu: 'Home', title: 'Huggingface', url: 'https://huggingface.co', logo_url: '', desc: '全球最大的开源模型托管平台'  },
            { menu: 'Home', title: 'ITDOG - 在线ping', url: 'https://www.itdog.cn/tcping', logo_url: '', desc: '在线tcping'  },
            { menu: 'Home', title: 'Ping0', url: 'https://ping0.cc', logo_url: '', desc: 'ip地址查询'  },
            { menu: 'Home', title: '浏览器指纹', url: 'https://www.browserscan.net/zh', logo_url: '', desc: '浏览器指纹查询'  },
            { menu: 'Home', title: 'nezha面板', url: 'https://ssss.nyc.mn', logo_url: 'https://nezha.wiki/logo.png', desc: 'nezha面板'  },
            { menu: 'Home', title: 'Api测试', url: 'https://hoppscotch.io', logo_url: '', desc: '在线api测试工具'  },
            { menu: 'Home', title: '域名检查', url: 'https://who.cx', logo_url: '', desc: '域名可用性查询' },
            { menu: 'Home', title: '域名比价', url: 'https://www.whois.com', logo_url: '', desc: '域名价格比较' },
            { menu: 'Home', title: 'NodeSeek', url: 'https://www.nodeseek.com', logo_url: 'https://www.nodeseek.com/static/image/favicon/favicon-32x32.png', desc: '主机论坛' },
            { menu: 'Home', title: 'Linux do', url: 'https://linux.do', logo_url: 'https://linux.do/uploads/default/optimized/3X/9/d/9dd49731091ce8656e94433a26a3ef36062b3994_2_32x32.png', desc: '新的理想型社区' },
            { menu: 'Home', title: '在线音乐', url: 'https://music.eooce.com', logo_url: 'https://p3.music.126.net/tBTNafgjNnTL1KlZMt7lVA==/18885211718935735.jpg', desc: '在线音乐' },
            { menu: 'Home', title: '在线电影', url: 'https://libretv.eooce.com', logo_url: 'https://img.icons8.com/color/240/cinema---v1.png', desc: '在线电影'  },
            { menu: 'Home', title: '免费接码', url: 'https://www.smsonline.cloud/zh', logo_url: '', desc: '免费接收短信验证码' },
            { menu: 'Home', title: '订阅转换', url: 'https://sublink.eooce.com', logo_url: 'https://img.icons8.com/color/96/link--v1.png', desc: '最好用的订阅转换工具' },
            { menu: 'Home', title: 'webssh', url: 'https://ssh.eooce.com', logo_url: 'https://img.icons8.com/fluency/240/ssh.png', desc: '最好用的webssh终端管理工具' },
            { menu: 'Home', title: '文件快递柜', url: 'https://filebox.nnuu.nyc.mn', logo_url: 'https://img.icons8.com/nolan/256/document.png', desc: '文件输出分享' },
            { menu: 'Home', title: '真实地址生成', url: 'https://address.nnuu.nyc.mn', logo_url: 'https://static11.meiguodizhi.com/favicon.ico', desc: '基于当前ip生成真实的地址' },
            // AI Stuff
            { menu: 'Ai Stuff', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { menu: 'Ai Stuff', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            { menu: 'Ai Stuff', title: 'Claude', url: 'https://claude.ai', logo_url: 'https://img.icons8.com/fluency/240/claude-ai.png', desc: 'Anthropic Claude AI' },
            { menu: 'Ai Stuff', title: 'Google Gemini', url: 'https://gemini.google.com', logo_url: 'https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg', desc: 'Google Gemini大模型' },
            { menu: 'Ai Stuff', title: '阿里千问', url: 'https://chat.qwenlm.ai', logo_url: 'https://g.alicdn.com/qwenweb/qwen-ai-fe/0.0.11/favicon.ico', desc: '阿里云千问大模型' },
            { menu: 'Ai Stuff', title: '问小白', url: 'https://www.wenxiaobai.com', logo_url: 'https://wy-static.wenxiaobai.com/wenxiaobai-web/production/3.12.14/_next/static/media/new_favicon.6d31cfe4.png', desc: 'Deepseek三方平台' },
            { menu: 'Ai Stuff', title: 'Genspark', url: 'https://www.genspark.ai/agents?type=moa_chat', logo_url: 'https://www.genspark.ai/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'AkashChat', url: 'https://chat.akash.network', logo_url: 'https://chat.akash.network/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'V0', url: 'https://v0.app/chat', logo_url: 'https://v0.dev/assets/icon-light-32x32.png', desc: 'Vercel旗下前端AI编程工具' },
            { menu: 'Ai Stuff', title: 'Same', url: 'https://same.new/', logo_url: 'https://same.new/favicon.ico', desc: 'AI快速仿站' },
            { menu: 'Ai Stuff', title: '响指HaiSnap', url: 'https://www.haisnap.com', logo_url: 'https://www.haisnap.com/favicon.ico', desc: '人人都能创造的AI零代码应用平台' },
            { menu: 'Ai Stuff', title: 'Readdy', url: 'https://readdy.ai/zh', logo_url: 'https://static.readdy.ai/web/favicon-180.png', desc: '' },
            { menu: 'Ai Stuff', title: 'OpenRouter', url: 'https://openrouter.ai', logo_url: 'https://openrouter.ai/favicon.ico', desc: '开放API平台' },
            { menu: 'Ai Stuff', title: 'Manus', url: 'https://manus.im', logo_url: 'https://manus.im/icon.png', desc: '全场景AI Agent' },
            { menu: 'Ai Stuff', title: 'Perplexity', url: 'https://www.perplexity.ai', logo_url: '', desc: '' },
            { menu: 'Ai Stuff', title: 'Grok', url: 'https://grok.com', logo_url: 'https://img.icons8.com/ios-filled/50/grok.png', desc: '马斯克出品的 AI' },
            { menu: 'Ai Stuff', title: 'Copilot', url: 'https://copilot.microsoft.com', logo_url: 'https://copilot.microsoft.com/favicon.ico', desc: '微软旗下 AI' },
            { menu: 'Ai Stuff', title: '豆包', url: 'https://www.doubao.com/chat', logo_url: 'https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/web/logo-icon.png', desc: '字节旗下AI智能助手' },
            { menu: 'Ai Stuff', title: '文心一言', url: 'https://yiyan.baidu.com', logo_url: 'https://eb-static.cdn.bcebos.com/logo/favicon.ico', desc: '百度旗下AI聊天助手' },
            { menu: 'Ai Stuff', title: 'Jules', url: 'https://jules.google.com', logo_url: 'https://www.gstatic.com/labs-code/code-app/favicon-48x48.png', desc: 'Google旗下AI管理github项目' },
            { menu: 'Ai Stuff', title: '硅基流动', url: 'https://cloud.siliconflow.cn', logo_url: 'https://cloud.siliconflow.cn/favicon.ico', desc: '免费的大模型API平台' },
            { menu: 'Ai Stuff', title: 'Kilo Code', url: 'https://kilocode.ai', logo_url: 'https://www.kilocode.ai/favicon.ico', desc: '亚马逊旗下AI编程工具' },
            { menu: 'Ai Stuff', title: 'Cursor', url: 'https://cursor.com/cn', logo_url: 'https://cursor.com/favicon.ico', desc: '目前很受欢迎的AI编程工具' },
            { menu: 'Ai Stuff', title: 'AI一键换脸', url: 'https://imgai.ai/zh', logo_url: 'https://imgai.ai/favicon.ico', desc: '' },
            { menu: 'Ai Stuff', title: 'AI PPT', url: 'https://www.aippt.cn', logo_url: 'https://www.aippt.cn/_nuxt/highlight-2.Bb1q-DtW.webp', desc: '' },
            { menu: 'Ai Stuff', title: 'AI照片修复', url: 'https://picwish.cn/photo-enhancer', logo_url: 'https://qncdn.aoscdn.com/astro/picwish/_astro/favicon@30w.61721eae.png', desc: '' },
            { menu: 'Ai Stuff', title: 'Bolt', url: 'https://bolt.new', logo_url: 'https://bolt.new/static/favicon.svg', desc: 'AI前端生成' },
            { menu: 'Ai Stuff', title: 'Llamacoder', url: 'https://llamacoder.together.ai', logo_url: 'https://llamacoder.together.ai/favicon.ico', desc: 'AI生成APP' },
            { menu: 'Ai Stuff', title: 'Codia', url: 'https://codia.ai', logo_url: 'https://codia.ai/favicon.ico', desc: '截图转设计图' },
            // AI Stuff - 子菜单卡片
            { subMenu: 'AI chat', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            // AI Stuff - 子菜单卡片
            { subMenu: 'AI tools', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://cdn.oaistatic.com/assets/favicon-eex17e9e.ico', desc: 'OpenAI官方AI对话' },
            { subMenu: 'AI tools', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://cdn.deepseek.com/chat/icon.png', desc: 'Deepseek AI搜索' },
            // Cloud
            { menu: 'Cloud', title: '阿里云', url: 'https://www.aliyun.com', logo_url: 'https://img.alicdn.com/tfs/TB1_ZXuNcfpK1RjSZFOXXa6nFXa-32-32.ico', desc: '阿里云官网' },
            { menu: 'Cloud', title: '腾讯云', url: 'https://cloud.tencent.com', logo_url: '', desc: '腾讯云官网' },
            { menu: 'Cloud', title: '甲骨文云', url: 'https://cloud.oracle.com', logo_url: '', desc: 'Oracle Cloud' },
            { menu: 'Cloud', title: '亚马逊云', url: 'https://aws.amazon.com', logo_url: 'https://img.icons8.com/color/144/amazon-web-services.png', desc: 'Amazon AWS' },
            { menu: 'Cloud', title: 'DigitalOcean', url: 'https://www.digitalocean.com', logo_url: 'https://www.digitalocean.com/_next/static/media/apple-touch-icon.d7edaa01.png', desc: 'DigitalOcean VPS' },
            { menu: 'Cloud', title: 'Vultr', url: 'https://www.vultr.com', logo_url: '', desc: 'Vultr VPS' },
            { menu: 'Cloud', title: '谷歌云', url: 'https://cloud.google.com', logo_url: '', desc: 'Google云提供免费3个月的VPS' },
            { menu: 'Cloud', title: 'Azure', url: 'https://azure.microsoft.com/zh-cn/pricing/purchase-options/azure-account?icid=azurefreeaccount', logo_url: 'https://azure.microsoft.com/favicon.ico', desc: '微软提供免费1年的VPS' },
            { menu: 'Cloud', title: 'Cloudcone', url: 'https://app.cloudcone.com', logo_url: 'https://cloudcone.com/wp-content/uploads/2017/06/cropped-logo-2-32x32.png', desc: '10美金每年的廉价VPS' },
            { menu: 'Cloud', title: 'Dartnode', url: 'https://dartnode.com', logo_url: 'https://dartnode.com/assets/dash/images/brand/favicon.png', desc: '开源项目可申请的永久免费VPS' },
            { menu: 'Cloud', title: 'DMIT', url: 'https://www.dmit.io', logo_url: 'https://www.dmit.io/favicon.ico', desc: '优质VPS线路' },
            { menu: 'Cloud', title: 'Bandwagonhost', url: 'https://bandwagonhost.com', logo_url: 'https://cdn.nodeimage.com/i/sOjwSRMxgDFDmei6uJxngdPXTF8aeNxP.png', desc: 'CN2-GIA优质线路' },
            { menu: 'Cloud', title: 'Racknerd', url: 'https://my.racknerd.com/index.php?rp=/login', logo_url: 'https://my.racknerd.com/templates/racknerdv851/files/favicon.png', desc: '10美金每年的廉价VPS' },
            { menu: 'Cloud', title: 'Lightnode', url: 'https://www.lightnode.com', logo_url: '', desc: '冷门区域VPS' },
            { menu: 'Cloud', title: 'ishosting', url: 'https://ishosting.com/en', logo_url: 'https://ishosting.com/meta/landing/favicon-48x48.png', desc: '地区多的VPS' },
            { menu: 'Cloud', title: 'Diylink', url: 'https://console.diylink.net/login', logo_url: 'https://console.diylink.net/favicon.ico', desc: '套壳Google和AWS的VPS' },
            { menu: 'Cloud', title: 'IBM', url: 'https://linuxone.cloud.marist.edu/#/login', logo_url: '', desc: '免费4个月的VPS（需住宅IP注册）' },
            { menu: 'Cloud', title: 'Sharon', url: 'https://whmcs.sharon.io', logo_url: 'https://framerusercontent.com/images/lvXR2x1W2bqvDhYmE8IQ1jHFv3Q.png', desc: '优质3网优化线路' },
            { menu: 'Cloud', title: 'Alice', url: 'https://alicenetworks.net', logo_url: '', desc: '' },
            { menu: 'Cloud', title: 'Yxvm', url: 'https://yxvm.com', logo_url: 'https://cdn.nodeimage.com/i/iz5EGYyDLI5qBkNr2nTsSLxMHrqR6MSS.webp', desc: '' },
            { menu: 'Cloud', title: '华为云', url: 'https://www.huaweicloud.com', logo_url: 'https://huaweicloud.com/favicon.ico', desc: '华为提供永久免费的云开发主机' },
            // Container
            { menu: 'Container', title: 'Koyeb', url: 'https://app.koyeb.com/auth/signin', logo_url: 'https://app.koyeb.com/favicon.ico', desc: '免费容器（注册需干净IP无需绑卡）' },
            { menu: 'Container', title: 'Render', url: 'https://dashboard.render.com/login', logo_url: 'https://dashboard.render.com/favicon-light.png', desc: '免费容器（注册需干净IP无需绑卡）' },
            { menu: 'Container', title: 'Fly', url: 'https://fly.io', logo_url: 'https://fly.io/phx/ui/images/favicon/favicon-595d1312b35dfe32838befdf8505515e.ico?vsn=d', desc: '免费容器（注册需绑卡）' },
            { menu: 'Container', title: 'Northflank', url: 'https://app.northflank.com', logo_url: 'https://app.northflank.com/favicon.ico', desc: '免费容器（注册需绑卡）' },
            { menu: 'Container', title: 'Choreo', url: 'https://console.choreo.dev', logo_url: 'https://console.choreo.dev/favicon.ico', desc: '免费容器（无需绑卡）' },
            { menu: 'Container', title: 'Railway', url: 'https://railway.com', logo_url: 'https://railway.com/favicon.ico', desc: '免费1个月容器（注册需干净IP，无需绑卡，到期可注销后重复注册）' },
            { menu: 'Container', title: 'Galaxycloud', url: 'https://beta.galaxycloud.app', logo_url: 'https://beta.galaxycloud.app/favicon.ico?v2', desc: '免费容器（无需绑卡）' },
            { menu: 'Container', title: 'Azure', url: 'https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0144p', logo_url: 'https://azure.microsoft.com/favicon.ico', desc: '微软免费容器（可以创建10个，az200或edu邮箱注册）' },
            { menu: 'Container', title: 'Codered', url: 'https://app.codered.cloud/login/?next=/hosting/webapps/app', logo_url: 'https://app.codered.cloud/static/core/img/favicon.png', desc: '免费Django框架容器（需isp环境注册）' },
            { menu: 'Container', title: 'Shuttle', url: 'https://console.shuttle.dev/login', logo_url: 'https://console.shuttle.dev/favicon.ico', desc: '免费的rust容器' },
            { menu: 'Container', title: 'Serv00', url: 'https://www.serv00.com', logo_url: '', desc: '免费的波兰容器（停止注册）' },
            { menu: 'Container', title: 'CT8', url: 'https://www.ct8.pl', logo_url: 'https://www.ct8.pl/static/ct8/img/logo.jpg', desc: 'Serv00同款（不定期开放注册）' },
            { menu: 'Container', title: 'Claw', url: 'https://ap-northeast-1.run.claw.cloud/signin?link=FZHSTH7HEBTU', logo_url: 'https://console.run.claw.cloud/favicon.ico', desc: '免费容器（半年以上Github账户每月免费5美金）' },
            { menu: 'Container', title: 'Cloudcat', url: 'https://cloud.cloudcat.one/signin', logo_url: 'https://cloud.cloudcat.one/favicon.ico', desc: 'Claw同款免费容器（每月免费5美金）' },
            { menu: 'Container', title: 'Huggingface', url: 'https://huggingface.co', logo_url: 'https://huggingface.co/favicon.ico', desc: '开源模型社区（免费的space）' },
            { menu: 'Container', title: 'Alwaysdata', url: 'https://admin.alwaysdata.com', logo_url: 'https://static.alwaysdata.com/media/reseller/1/theme/favicon_kfxZA8s.png', desc: '免费容器（干净IP注册免绑卡）' },
            { menu: 'Container', title: 'Vercel', url: 'https://vercel.com/login?next=%2Fdashboard', logo_url: 'https://vercel.com/favicon.ico', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Netlify', url: 'https://www.netlify.com', logo_url: 'https://www.netlify.com/favicon.ico', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Modal', url: 'https://modal.com', logo_url: 'https://modal.com/assets/favicon.svg', desc: '每月5美金（风控严格）' },
            { menu: 'Container', title: 'Scalingo', url: 'https://scalingo.com', logo_url: 'https://scalingo.com/favicon.ico', desc: '法国家宽容器（风控严格）' },
            { menu: 'Container', title: 'Sevalla', url: 'https://app.sevalla.com/login', logo_url: 'https://sevalla.com/favicon.ico', desc: '绑卡免费10个月（风控严格）' },
            { menu: 'Container', title: 'Phala', url: 'https://phala.com', logo_url: 'https://cloud.phala.network/favicon.ico', desc: '免费400美金（可用10个月）' },
            { menu: 'Container', title: 'Wasmer', url: 'https://wasmer.io', logo_url: 'https://wasmer.io/icons/favicon.svg', desc: '免费静态网页托管' },
            { menu: 'Container', title: 'Appwrite', url: 'https://cloud.appwrite.io/console/login?redirect=%2Fconsole', logo_url: 'https://appwrite.io/images/logos/logo.svg', desc: '免费多地区' },
            { menu: 'Container', title: 'Leaflow', url: 'https://leaflow.net/login', logo_url: 'https://leaflow.net/build/assets/Logo-COIKldAv.png', desc: '免费香港容器（签到可长期使用）' },
            { menu: 'Container', title: 'Zeabur', url: 'https://zeabur.com/zh-CN/login', logo_url: 'https://dash.zeabur.com/favicon.ico', desc: '免费容器（每月免费5美金）' },
            { menu: 'Container', title: 'Databricks', url: 'https://www.databricks.com', logo_url: '', desc: 'APP' },
            { menu: 'Container', title: 'idx', url: 'https://idx.google.com', logo_url: 'https://www.gstatic.com/monospace/250314/macos-icon-192.png', desc: 'Google IDX' },
            // Container - Game Server 子菜单卡片
            { subMenu: 'Game Server', title: 'Adkynet', url: 'https://manager.adkynet.com/login', logo_url: 'https://www.adkynet.com/favicon.png', desc: '稳定的node/java/python容器（1月1续）' },
            { subMenu: 'Game Server', title: 'Axsoter', url: 'https://free.axsoter.com', logo_url: 'https://www.axsoter.com/assets/img/icon.webp', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Crosmo', url: 'https://host.crosmo.de', logo_url: '', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Flexynode', url: 'https://flexynode.com', logo_url: 'https://448d564e-e592-4849-b808-2fdf2cb6c5b1.svc.edge.scw.cloud/website/img/2.webp', desc: '64M nodejs/python玩具' },
            { subMenu: 'Game Server', title: 'Boxmineworld', url: 'https://dash.boxmineworld.com/login', logo_url: 'https://boxmineworld.com/images/favicon.png', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Wispbyte', url: 'https://wispbyte.com', logo_url: 'https://wispbyte.com/assets/wispbyte_blue_nobg.webp', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Searcade', url: 'https://searcade.com/en', logo_url: 'https://448d564e-e592-4849-b808-2fdf2cb6c5b1.svc.edge.scw.cloud/website/img/2.webp', desc: '每10天需登陆1次' },
            { subMenu: 'Game Server', title: 'Echohost', url: 'https://client.echohost.org/login', logo_url: 'https://client.echohost.org/storage/favicon.ico', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Embotic', url: 'https://dash.embotic.xyz', logo_url: '', desc: '游戏机' },
            { subMenu: 'Game Server', title: 'Zenix', url: 'https://panel.zenix.sg', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Waifly', url: 'https://dash.waifly.com', logo_url: 'https://waifly.com/images/favicon.png', desc: '' },
            { subMenu: 'Game Server', title: 'Karlo', url: 'https://karlo-hosting.com', logo_url: 'https://karlo-hosting.com/favicon.ico', desc: '' },
            { subMenu: 'Game Server', title: 'Solar', url: 'https://account.solarhosting.cc/login', logo_url: 'https://account.solarhosting.cc/storage/favicon.ico', desc: '' },
            { subMenu: 'Game Server', title: 'Berrynodes', url: 'https://dash.berrynodes.com', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Spaceify', url: 'https://client.spaceify.eu', logo_url: 'https://client.spaceify.eu/storage/logo.png', desc: '易风控' },
            { subMenu: 'Game Server', title: 'Freeserver', url: 'https://dash.freeserver.tw/auth/login', logo_url: 'https://dash.freeserver.tw/assets/freeserverv3.bb434095.png', desc: '台湾游戏机' },
            { subMenu: 'Game Server', title: 'Bot-hosting', url: 'https://bot-hosting.net', logo_url: '', desc: '需要赚金币续费' },
            { subMenu: 'Game Server', title: 'Atomic', url: 'https://panel.atomicnetworks.co', logo_url: 'https://cdn.wisp.gg/uploaded_assets/panel.atomicnetworks.co/c1146e9e03bfc07d80b4714ff0d3bc43a3cf071c2fdda161dd49dcd831fbecd8.png', desc: '稳定多年的游戏机' },
            { subMenu: 'Game Server', title: 'Boxmineworld', url: 'https://dash.boxmineworld.com/login', logo_url: 'https://dash.boxmineworld.com/favicon.ico', desc: '稳定的美国游戏机' },
            { subMenu: 'Game Server', title: 'Zampto', url: 'https://hosting.zampto.net/auth', logo_url: 'https://zampto.net/assets/img/logo-icon-gradient.png', desc: '意大利游戏机' },
            { subMenu: 'Game Server', title: 'Altr', url: 'https://console.altr.cc/dashboard', logo_url: 'https://i.imgur.com/EZep3AC.png', desc: '多地区游戏机' },
            { subMenu: 'Game Server', title: 'Skybots', url: 'https://skybots.tech/fr/#google_vignette', logo_url: '', desc: '法国ISP-nodejs玩具' },
            { subMenu: 'Game Server', title: 'Greathost', url: 'https://greathost.es/login', logo_url: '', desc: '' },
            { subMenu: 'Game Server', title: 'Lunes', url: 'https://betadash.lunes.host/login?next=/', logo_url: '', desc: '' },
            // Software
            { menu: 'Software', title: 'Hellowindows', url: 'https://hellowindows.cn', logo_url: 'https://hellowindows.cn/logo-s.png', desc: 'windows系统及office下载' },
            { menu: 'Software', title: '奇迹秀', url: 'https://www.qijishow.com/down', logo_url: 'https://www.qijishow.com/img/ico.ico', desc: '设计师的百宝箱' },
            { menu: 'Software', title: '易破解', url: 'https://www.ypojie.com', logo_url: 'https://www.ypojie.com/favicon.ico', desc: '精品windows软件' },
            { menu: 'Software', title: 'Cracked Software', url: 'https://topcracked.com', logo_url: 'https://cdn.mac89.com/win_macxf_node/static/favicon.ico', desc: 'windows破解软件' },
            { menu: 'Software', title: 'ZTasker', url: 'https://www.everauto.net', logo_url: 'https://www.everauto.net/images/App32.png', desc: '定时/热键/事件/键鼠模拟/操作录制/自动化流程' },
            { menu: 'Software', title: '云萌Win10/11激活', url: 'https://cmwtat.cloudmoe.com/cn.html', logo_url: 'https://img.icons8.com/color/96/windows-10.png', desc: 'windows系统激活工具' },
            { menu: 'Software', title: 'Zen-browser', url: 'https://zen-browser.app', logo_url: '', desc: '超好用的一款浏览器' },
            { menu: 'Software', title: 'Adspower', url: 'https://activity.adspower.com/ap/dist/', logo_url: 'https://activity.adspower.com/ap/dist/favicon.ico', desc: '指纹浏览器（3个免费环境）' },
            { menu: 'Software', title: 'Hubstudio', url: 'https://www.hubstudio.cn', logo_url: 'https://www.hubstudio.cn/_next/static/images/logo-white-43c86335b0f59ef4cdba7f4c7009fea4.png', desc: '指纹浏览器（每天20次免费）' },
            { menu: 'Software', title: 'incogniton', url: 'https://incogniton.com/zh-hans', logo_url: 'https://incogniton.com/favicon.ico', desc: '指纹浏览器（10个免费环境）' },
            { menu: 'Software', title: 'Termora', url: 'https://www.termora.app/downloads', logo_url: 'https://www.termora.app/favicon.ico', desc: '简约好用的SSH软件' },
            { menu: 'Software', title: 'Cherry Studio', url: 'https://www.cherry-ai.com', logo_url: 'https://www.cherry-ai.com/assets/favicon-BmbgeFTf.png', desc: 'AI对话客户端' },
            { menu: 'Software', title: 'MusicFree', url: 'https://musicfree.catcat.work', logo_url: 'https://musicfree.catcat.work/favicon.ico', desc: '免费开源的音乐播放器' },
            { menu: 'Software', title: 'LXmusic', url: 'https://lxmusic.toside.cn', logo_url: 'https://lxmusic.toside.cn/img/logo.svg', desc: '免费开源的音乐播放器' },
            { menu: 'Software', title: 'UU远程', url: 'https://uuyc.163.com', logo_url: 'https://uuyc.163.com/favicon.ico', desc: '游戏级远控制（网易出品）' },
            { menu: 'Software', title: 'QtScrcpy', url: 'https://github.com/barry-ran/QtScrcpy/releases/tag/v3.3.3', logo_url: 'https://img.icons8.com/color/96/android-os.png', desc: '免费开源的安卓投屏软件' },
            { menu: 'Software', title: '小丸工具箱', url: 'https://maruko.appinn.me', logo_url: 'https://maruko.appinn.me/favicon.ico', desc: '非常好用的视频音频压缩软件' },
            { menu: 'Software', title: 'Beekeeper Studio', url: 'https://www.beekeeperstudio.io/', logo_url: 'https://www.beekeeperstudio.io/favicon.ico', desc: '免费开源的数据库管理软件' },
            { menu: 'Software', title: 'Navicat Premium', url: 'https://pan.baidu.com/s/1HjfAn71Vgp-TeoY755TZOw?pwd=mc73', logo_url: 'https://www.navicat.com.cn/images/Navicat_16_Premium_win_256x256.ico', desc: '头部数据库管理软件（此链接破解版）' },
            { menu: 'Software', title: 'Geek Uninstaller', url: 'https://geekuninstaller.com/download', logo_url: 'https://geekuninstaller.com/favicon.ico', desc: '小巧轻便的卸载软件' },
            { menu: 'Software', title: 'Pixpin', url: 'https://pixpin.cn', logo_url: 'https://pixpin.cn/favicon.ico', desc: '非常不错的截图软件' },
            { menu: 'Software', title: 'Mem Reduct', url: 'https://github.com/henrypp/memreduct/releases/tag/v.3.5.2', logo_url: 'https://img.icons8.com/pulsar-gradient/48/memory-slot.png', desc: '内存自动清理' },
            { menu: 'Software', title: 'phpstudy', url: 'https://www.xp.cn/phpstudy', logo_url: 'https://www.xp.cn/favicon.ico', desc: '本地服务器环境管理' },
            { menu: 'Software', title: 'Requestly', url: 'https://requestly.com', logo_url: 'https://requestly.com/favicon.ico', desc: 'API测试/抓包' },
            { menu: 'Software', title: 'Raylink', url: 'https://www.raylink.live', logo_url: '', desc: '远程控制' },
            // Software - Proxy 子菜单卡片
            { subMenu: 'Proxy', title: 'V2rayN', url: 'https://v2rayn.2dust.link/', logo_url: 'https://images.sftcdn.net/images/t_app-icon-m/p/a2c8f10a-f0e8-460b-a03c-d17953176ab8/2246704787/v2rayn-v2rayN-icon.png', desc: '最受欢迎的代理软件' },
            { subMenu: 'Proxy', title: 'Mihomo Party', url: 'https://clashparty.org', logo_url: 'https://mihomo.party/favicon.ico', desc: 'Mihomo内核最受欢迎的代理软件' },
            { subMenu: 'Proxy', title: 'GUI.for.SingBox', url: 'https://github.com/GUI-for-Cores/GUI.for.SingBox/releases/tag/v1.14.0', logo_url: 'https://sing-box.sagernet.org/assets/icon.svg', desc: '第三方开源SingBox代理工具' },
            { subMenu: 'Proxy', title: 'FlClash', url: 'https://github.com/chen08209/FlClash/releases/tag/v0.8.90', logo_url: '', desc: 'Clash系列人气代理软件' },
            { subMenu: 'Proxy', title: 'Karing', url: 'https://karing.app/download', logo_url: 'https://karing.app/img/favicon.ico', desc: '新一代全能型代理软件（适配多系统）' },
            { subMenu: 'Proxy', title: 'Nekobox', url: 'https://nekobox.tools/nekoray', logo_url: 'https://nekobox.tools/favicon.ico', desc: 'windows版本停止维护，谨慎使用' },
            { subMenu: 'Proxy', title: 'FlyClash', url: 'https://github.com/GtxFury/FlyClash/releases/tag/v0.1.7', logo_url: 'https://raw.githubusercontent.com/GtxFury/FlyClash/main/public/logo.png', desc: 'Mihomo内核新一代代理软件' },
            { subMenu: 'Proxy', title: 'ClashBox', url: 'https://github.com/xiaobaigroup/ClashBox', logo_url: 'https://clash.top/wp-content/uploads/2024/01/Clash.png', desc: 'HarmonyOS NEXT的代理软件' },
            // Software - Macos 子菜单卡片
            { subMenu: 'Macos', title: 'Macwk', url: 'https://www.macwk.com', logo_url: 'https://www.macwk.com/favicon-32x32.ico', desc: '精品Mac软件' },
            { subMenu: 'Macos', title: 'Macsc', url: 'https://mac.macsc.com', logo_url: 'https://cdn.mac89.com/macsc_node/static/favicon.ico', desc: '' },
            // Tools
            { menu: 'Tools', title: 'Argo Tunnel json获取', url: 'https://fscarmen.cloudflare.now.cc', logo_url: '', desc: 'cloudflared Argo Tunnel固定隧道json获取' },
            { menu: 'Tools', title: 'base64工具', url: 'https://www.qqxiuzi.cn/bianma/base64.htm', logo_url: 'https://cdn.base64decode.org/assets/images/b64-180.webp', desc: '在线base64编码解码' },
            { menu: 'Tools', title: '二维码生成', url: 'https://cli.im', logo_url: 'https://img.icons8.com/fluency/96/qr-code.png', desc: '二维码生成工具' },
            { menu: 'Tools', title: 'JS混淆', url: 'https://obfuscator.io', logo_url: 'https://img.icons8.com/color/240/javascript--v1.png', desc: '在线Javascript代码混淆' },
            { menu: 'Tools', title: 'Python混淆', url: 'https://freecodingtools.org/tools/obfuscator/python', logo_url: 'https://img.icons8.com/color/240/python--v1.png', desc: '在线python代码混淆' },
            { menu: 'Tools', title: 'Remove.photos', url: 'https://remove.photos/zh-cn', logo_url: 'https://img.icons8.com/doodle/192/picture.png', desc: '一键抠图' },
            { menu: 'Tools', title: 'Pagespeed', url: 'https://pagespeed.web.dev', logo_url: 'https://www.gstatic.com/pagespeed/insights/ui/logo/favicon_48.png', desc: '' },
            { menu: 'Tools', title: '自动访问', url: 'https://matte.ct8.pl', logo_url: 'https://img.icons8.com/dusk/100/globe.png', desc: '自动访问保活管理系统' },
            { menu: 'Tools', title: 'Cron-job', url: 'https://console.cron-job.org/login', logo_url: 'https://console.cron-job.org/logo192.png', desc: '定时自动访问网页' },
            { menu: 'Tools', title: '网址缩短', url: 'https://short.ssss.nyc.mn', logo_url: 'https://short.ssss.nyc.mn/asset/img/favicon.png', desc: '' },
            { menu: 'Tools', title: 'Linuxmirrors', url: 'https://linuxmirrors.cn', logo_url: 'https://linuxmirrors.cn/assets/images/brand/svg/logo-light.svg', desc: '' },
            { menu: 'Tools', title: 'Vocal Remover', url: 'https://vocalremover.org', logo_url: 'https://vocalremover.org/favicon.ico', desc: '声音分离' },
            { menu: 'Tools', title: 'JSON工具', url: 'https://www.json.cn', logo_url: 'https://img.icons8.com/nolan/128/json.png', desc: 'JSON格式化/校验' },
            { menu: 'Tools', title: '文件格式转换', url: 'https://convertio.co/zh', logo_url: 'https://convertio.co/favicon.ico', desc: '超300种文件格式转换' },
            { menu: 'Tools', title: '视频在线下载', url: 'https://tubedown.cn/youtube', logo_url: 'https://tubedown.cn/favicon.ico', desc: '在线视频解析下载' },
            { menu: 'Tools', title: 'emoji表情大全', url: 'https://www.iamwawa.cn/emoji.html', logo_url: 'https://www.iamwawa.cn/favicon.ico', desc: '各类目emoji' },
            { menu: 'Tools', title: '信用卡生成', url: 'https://bincheck.io/zh/credit-card-generator', logo_url: '', desc: '信用卡生成器' },
            { menu: 'Tools', title: 'Squoosh', url: 'https://squoosh.app', logo_url: 'https://squoosh.app/c/icon-large-maskable-c2078ced.png', desc: '图片无损压缩' },
            { menu: 'Tools', title: 'Tool小工具', url: 'https://tool.lu', logo_url: 'https://tool.lu/favicon.ico', desc: '小工具' },
            { menu: 'Tools', title: 'D1tools', url: 'https://d1tools.com', logo_url: 'https://d1tools.com/favicon.ico', desc: '' },
            { menu: 'Tools', title: 'Lumiproxy', url: 'https://www.lumiproxy.com/zh-hans/online-proxy/proxysite', logo_url: 'https://www.lumiproxy.com/favicon.ico', desc: '在线网页住宅代理' },
            { menu: 'Tools', title: 'Proxyshare', url: 'https://www.proxyshare.com/zh/proxysite', logo_url: 'https://www.proxyshare.com/favicon.ico', desc: '在线网页住宅代理' },
            { menu: 'Tools', title: 'Dnsleaktest', url: 'https://dnsleaktest.com', logo_url: 'https://dnsleaktest.com/assets/favicon.ico', desc: 'DNS泄露检测' },
            { menu: 'Tools', title: 'Deobfuscator', url: 'https://raz1ner.com/Online-Tools/JavaScript-Deobfuscator.html', logo_url: 'https://dev-coco.github.io/favicon.ico', desc: 'JS反混淆' },
            { menu: 'Tools', title: 'Flexclip', url: 'https://www.flexclip.com/cn/ai/', logo_url: 'https://www.flexclip.com/favicon.ico', desc: '' },
            { menu: 'Tools', title: '星空音乐下载', url: 'https://www.vh.hk/', logo_url: 'https://www.vh.hk/favicon.ico', desc: '' },
            { menu: 'Tools', title: 'Blackace', url: 'https://blackace.app', logo_url: 'https://blackace.app/imgs/favicon.ico', desc: '网站打包成APP' },
            { menu: 'Tools', title: 'PHP混淆加密', url: 'https://www.toolnb.com/tools/phpcarbylamine.html', logo_url: '', desc: '' },
            { menu: 'Tools', title: '中文转码', url: 'https://www.bchrt.com/tools/punycode-encoder', logo_url: '', desc: '' },
            // Tools - Free SMS 子菜单卡片
            { subMenu: 'Free SMS', title: 'smser', url: 'https://smser.net', logo_url: 'https://smser.net/img/smser.net/favicon-32x32.png', desc: '' },
            { subMenu: 'Free SMS', title: 'freereceivesms', url: 'https://www.freereceivesms.com', logo_url: '', desc: '' },
            { subMenu: 'Free SMS', title: 'sms24', url: 'https://sms24.me/en', logo_url: 'https://sms24.me/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'onlinesim', url: 'https://onlinesim.io/ru', logo_url: 'https://onlinesim.io/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'smsonline', url: 'https://www.smsonline.cloud/zh#google_vignette', logo_url: 'https://www.smsonline.cloud/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receive-sms', url: 'https://wetalkapp.com/receive-sms', logo_url: 'https://wetalkapp.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'supercloudsms', url: 'https://www.supercloudsms.com/country/usa/1.html', logo_url: '', desc: '' },
            { subMenu: 'Free SMS', title: 'freephonenum', url: 'https://freephonenum.com', logo_url: '', desc: '只有美国和加拿大号码' },
            { subMenu: 'Free SMS', title: 'lubansms', url: 'https://lubansms.com/receiveSms', logo_url: 'https://lubansms.com/img/apple-touch-icon.png', desc: '' },
            { subMenu: 'Free SMS', title: '7sim', url: 'https://7sim.net', logo_url: 'https://7sim.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receiveasms', url: 'https://www.receiveasms.com', logo_url: 'https://www.receiveasms.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivesmsonline', url: 'https://www.receivesmsonline.net', logo_url: 'https://www.receivesmsonline.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-online', url: 'https://sms-online.co/receive-free-sms', logo_url: 'https://sms-online.co/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivefreesms', url: 'https://receivefreesms.net', logo_url: 'https://receivefreesms.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'receivesmsonline', url: 'https://receivesmsonline.in/number', logo_url: 'https://receivesmsonline.in/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-receive', url: 'https://sms-receive.net', logo_url: 'https://sms-receive.net/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'jiemahao', url: 'https://jiemahao.com', logo_url: 'https://jiemahao.com/favicon.ico', desc: '接号码' },
            { subMenu: 'Free SMS', title: 'bestsms', url: 'https://bestsms.xyz', logo_url: 'https://bestsms.xyz/static/yunji/imgs/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'zusms', url: 'https://www.zusms.com', logo_url: 'https://www.zusms.com/favicon.ico', desc: '有云短信' },
            { subMenu: 'Free SMS', title: 'mytrashmobile', url: 'https://zh.mytrashmobile.com/numbers', logo_url: 'https://static.mytrashmobile.com/assets/images/icons/favicons/apple-icon-60x60.png', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-japan', url: 'https://sms-japan.com', logo_url: 'https://sms-japan.com/static/smsjapan/images/favicon.png', desc: '' },
            { subMenu: 'Free SMS', title: 'online-sim', url: 'https://online-sim.pro/zh', logo_url: 'https://online-sim.pro/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'temp-number', url: 'https://temp-number.com', logo_url: 'https://temp-number.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'tiger-sms', url: 'https://tiger-sms.com/free', logo_url: 'https://tiger-sms.shop/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'clearcode', url: 'https://clearcode.cn', logo_url: 'https://clearcode.cn/static/tw/favicon.ico?v=2', desc: '中国号码' },
            { subMenu: 'Free SMS', title: 'tempsmss', url: 'https://tempsmss.com', logo_url: 'https://tempsmss.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'free-numbers', url: 'https://sms-verification-number.com/free-numbers-cn/#activity', logo_url: 'https://sms-verification-number.com/frontend/assets/img/logo.svg', desc: '' },
            { subMenu: 'Free SMS', title: 'mianfeijiema', url: 'https://www.mianfeijiema.com/#google_vignette', logo_url: 'https://www.mianfeijiema.com/static/picture/logo.png', desc: '' },
            { subMenu: 'Free SMS', title: 'receive-smss', url: 'https://receive-smss.com', logo_url: 'https://receive-smss.com/favicon.ico', desc: '' },
            { subMenu: 'Free SMS', title: 'sms-man', url: 'https://sms-man.com/cn/free-numbers', logo_url: 'https://sms-man.com/favicon.ico', desc: '' },
            // Mail or Domain
            { menu: 'Mail or Domain', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: 'Google邮箱' },
            { menu: 'Mail or Domain', title: 'Outlook', url: 'https://outlook.live.com', logo_url: 'https://img.icons8.com/color/256/ms-outlook.png', desc: '微软Outlook邮箱' },
            { menu: 'Mail or Domain', title: 'Proton Mail', url: 'https://account.proton.me', logo_url: 'https://account.proton.me/assets/apple-touch-icon-120x120.png', desc: '安全加密邮箱' },
            { menu: 'Mail or Domain', title: 'QQ邮箱', url: 'https://mail.qq.com', logo_url: 'https://mail.qq.com/zh_CN/htmledition/images/favicon/qqmail_favicon_96h.png', desc: '腾讯QQ邮箱' },
            { menu: 'Mail or Domain', title: '雅虎邮箱', url: 'https://mail.yahoo.com', logo_url: 'https://img.icons8.com/color/240/yahoo--v2.png', desc: '雅虎邮箱' },
            { menu: 'Mail or Domain', title: '10分钟临时邮箱', url: 'https://linshiyouxiang.net', logo_url: 'https://linshiyouxiang.net/static/index/zh/images/favicon.ico', desc: '10分钟临时邮箱' },
            { menu: 'Mail or Domain', title: '临时域名邮箱', url: 'https://email.zrvvv.com', logo_url: 'https://email.zrvvv.com/logo.png', desc: '临时域名邮箱（可重复收件或发件）' },
            { menu: 'Mail or Domain', title: '2925无限邮箱', url: 'https://www.2925.com/login', logo_url: 'https://www.2925.com/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: '风车临时邮箱', url: 'https://mail.xoxome.online/login', logo_url: '', desc: '可长期使用的临时邮箱' },
            { menu: 'Mail or Domain', title: '88完美邮箱', url: 'https://www.88.com', logo_url: '', desc: '' },
            { menu: 'Mail or Domain', title: '临时edu邮箱', url: 'https://tempmail.edu.kg', logo_url: 'https://tempmail.edu.kg/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: 'Tempmail', url: 'https://tempmail.plus/zh/#!', logo_url: 'https://tempmail.plus/favicon.ico', desc: '' },
            { menu: 'Mail or Domain', title: '临时邮箱', url: 'https://22.do/zh', logo_url: 'https://22.do/assets/images/logo.png', desc: '' },
            { menu: 'Mail or Domain', title: 'nyc.mn域名', url: 'https://dot.nyc.mn/my-domain', logo_url: 'https://dot.nyc.mn/wp-content/uploads/2024/09/nycmnicon-150x150.png', desc: '免费2级域名（已取消免费）' },
            { menu: 'Mail or Domain', title: 'HiDNS', url: 'https://www.hidoha.net', logo_url: 'https://www.hidoha.net/themes/huraga/assets/favicon.ico', desc: '免费2级域名（邀请注册）' },
            { menu: 'Mail or Domain', title: 'US.KG', url: 'https://dash.domain.digitalplat.org/auth/login?next=%2F', logo_url: '', desc: '免费2级域名（dpdns.org/us.kg/xx.kg）' },
            { menu: 'Mail or Domain', title: 'l53', url: 'https://customer.l53.net', logo_url: 'https://customer.l53.net/favicon.ico', desc: 'ggff.net免费2级域名' },
            { menu: 'Mail or Domain', title: 'mffac临时邮箱', url: 'https://www.mffac.com', logo_url: 'https://www.mffac.com/favicon.ico', desc: 'mffac临时邮箱' },
            { menu: 'Mail or Domain', title: 'zabc.net', url: 'https://zoneabc.net/login?redirect=/dashboard', logo_url: 'https://zoneabc.net/logo.svg', desc: '免费2级域名（不可托管CF）' },
            { menu: 'Mail or Domain', title: 'eu.org', url: 'https://nic.eu.org', logo_url: '', desc: '免费2级域名（已停止注册）' },
            { menu: 'Mail or Domain', title: 'zone.id', url: 'https://autz.org/onboarding/qinw2ix?callback_url=https%3A%2F%2Fmy.zone.id%2Fsubdomains', logo_url: 'https://autz.org/uploads/a8ia2qkiq.webp', desc: '免费2级域名（不可托管CF）' },
            { menu: 'Mail or Domain', title: 'Spaceship', url: 'https://www.spaceship.com', logo_url: 'https://spaceship-cdn.com/static/spaceship/favicon/spaceship-icon.svg', desc: 'xyz实惠的域名服务商' },
            { menu: 'Mail or Domain', title: 'Dynadot', url: 'https://www.dynadot.com/zh', logo_url: 'https://www.dynadot.com/favicon.ico', desc: '经常送免费域名（续费较贵）' },
            { menu: 'Mail or Domain', title: 'Godaddy', url: 'https://www.godaddy.com/zh', logo_url: 'https://img6.wsimg.com/ux-assets/favicon/favicon-32x32.png', desc: '全球最大的域名服务商（域名较贵）' },
            { menu: 'Mail or Domain', title: 'Namesilo', url: 'https://www.namesilo.com', logo_url: 'https://www.namesilo.com/favicon.ico', desc: '非常实惠的域名' },
            // Other
            { menu: 'Other', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', desc: 'Google邮箱' },
            { menu: 'Other', title: 'Outlook', url: 'https://outlook.live.com', logo_url: 'https://img.icons8.com/color/256/ms-outlook.png', desc: '微软Outlook邮箱' },
            { menu: 'Other', title: 'Proton Mail', url: 'https://account.proton.me', logo_url: 'https://account.proton.me/assets/apple-touch-icon-120x120.png', desc: '安全加密邮箱' },
            { menu: 'Other', title: 'QQ邮箱', url: 'https://mail.qq.com', logo_url: 'https://mail.qq.com/zh_CN/htmledition/images/favicon/qqmail_favicon_96h.png', desc: '腾讯QQ邮箱' },
            { menu: 'Other', title: '雅虎邮箱', url: 'https://mail.yahoo.com', logo_url: 'https://img.icons8.com/color/240/yahoo--v2.png', desc: '雅虎邮箱' },
            { menu: 'Other', title: '10分钟临时邮箱', url: 'https://linshiyouxiang.net', logo_url: 'https://linshiyouxiang.net/static/index/zh/images/favicon.ico', desc: '10分钟临时邮箱' },
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





