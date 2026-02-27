import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'new-chat',
      component: () => import('./components/ChatView.vue'),
    },
    {
      path: '/:threadId',
      name: 'chat',
      component: () => import('./components/ChatView.vue'),
      props: true,
    },
  ],
});

export { router };
