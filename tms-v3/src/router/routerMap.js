const RouterMap = [
  {
    path: '/',
    name: 'login',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/login', // 补充登录页显式路径（匹配白名单）
    name: 'login-page',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/schedule',
      },
      {
        path: 'schedule',
        name: 'board',
        component: () => import('@/views/admin/ScheduleBoard.vue'),
      },
      {
        path: 'manage',
        name: 'admin-schedule',
        component: () => import('@/views/admin/ScheduleManage.vue'),
      },
      {
        path: 'import',
        name: 'admin-import',
        component: () => import('@/views/admin/ScheduleImport.vue'),
      },
      {
        path: 'movies',
        name: 'admin-movies',
        component: () => import('@/views/admin/MovieLibrary.vue'),
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/settings.vue'),
      },
    ],
  },
  {
    path: '/viewer',
    component: () => import('@/views/viewer/ViewerLayout.vue'), // 修复：改用访客专属布局
    children: [
      {
        path: '',
        redirect: '/viewer/schedule',
      },
      {
        path: 'schedule', // 核心：补充实际的访客排期页组件
        name: 'viewer-schedule',
        component: () => import('@/views/viewer/ScheduleBoard.vue'), // 替换为你的访客排期页组件
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
]

// 导出路由表
export default RouterMap
