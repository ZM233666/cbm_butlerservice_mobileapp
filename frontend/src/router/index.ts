import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/assignments',
      name: 'assignments',
      component: () => import('@/views/ManagerAssignmentsView.vue'),
    },
    {
      path: '/task-list',
      name: 'task-list',
      component: () => import('@/views/TaskListView.vue'),
    },
    {
      path: '/task-center',
      name: 'task-center',
      component: () => import('@/views/TaskCenterView.vue'),
    },
    {
      path: '/records',
      name: 'records',
      component: () => import('@/views/RecordsView.vue'),
    },
    {
      path: '/my',
      name: 'my',
      component: () => import('@/views/MyView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.guest) {
    if (auth.isLoggedIn) return { path: '/' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { next: to.fullPath } }
  }

  if (!auth.canAccess(to.path)) {
    return { path: '/' }
  }

  return true
})

export default router
