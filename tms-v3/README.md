tms-v3                          
├─ public                       
│  ├─ favicon.ico               
│  ├─ logo.png                  
│  ├─ logo.webp                 
│  └─ tms-logo.png              
├─ src                          
│  ├─ assets                    
│  │  ├─ base.css               
│  │  ├─ logo.png               
│  │  ├─ logo.webp              
│  │  └─ main.css               
│  ├─ components                组件
│  │  ├─ icons                  
│  │  │  └─ IconLogout.vue      
│  │  ├─ Item                   
│  │  │  ├─ PickNum.vue         
│  │  │  └─ PickTime.vue        
│  │  ├─ MovieSource copy.vue   
│  │  ├─ MovieSource.vue        
│  │  └─ ScheduleItem.vue       
│  ├─ router                    Vue路由
│  │  ├─ index.js               
│  │  └─ routerMap.js           
│  ├─ stores                    无用
│  │  └─ counter.js             
│  ├─ utils                     API对接接口的封装axios文件
│  │  ├─ API                    
│  │  │  ├─ auth.js             身份认证API接口调用方法
│  │  │  ├─ Data.js             后台数据API接口调用方法
│  │  │  └─ System.js           系统配置API接口调用方法
│  │  └─ request.js             API接口调用方法总出入口
│  ├─ views                     
│  │  ├─ admin                  管理员路由
│  │  │  ├─ AdminLayout.vue     布局
│  │  │  ├─ MovieLibrary.vue    片源信息页面
│  │  │  ├─ ScheduleBoard.vue   排期展示页面
│  │  │  ├─ ScheduleImport.vue  Excel排期导入页面
│  │  │  ├─ ScheduleManage.vue  排期管理页面
│  │  │  └─ settings.vue        系统设置页面
│  │  ├─ viewer                 观察者路由
│  │  │  ├─ ScheduleBoard.vue   排期展示页面
│  │  │  └─ ViewerLayout.vue    布局
│  │  └─ Login.vue              登录页面
│  ├─ App.vue                   入口
│  ├─ config.js                 配置文件
│  └─ main.js                   配置文件
├─ index.html                   入口
├─ jsconfig.json                
├─ package.json                 
├─ README.md                    
├─ vite.config.js               
└─ yarn.lock                    
