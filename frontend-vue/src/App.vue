<script setup>
import AuthAndCreate from './components/AuthAndCreate.vue';
import ItineraryManager from './components/ItineraryManager.vue';
import ProfileCard from './components/ProfileCard.vue';
import { ref, computed, onMounted, watch } from 'vue';

// 狀態
const isAuthenticated = ref(false);
const userEmail = ref(null);
const refreshKey = ref(0);

// 正在觀看的目標使用者 (自己 or 別人)
const viewEmail = ref(null);

// 從網址讀 ?profile=<email>
function syncViewEmailFromURL() {
  const params = new URLSearchParams(window.location.search);
  const qEmail = params.get('profile'); // 統一用 'profile'

  if (qEmail && qEmail.includes('@')) {
    viewEmail.value = qEmail; // 看別人
  } else {
    viewEmail.value = userEmail.value; // 看自己
  }
}

function goHome() {
  // 回到「看自己」
  const savedEmail = localStorage.getItem('tripplanner_userEmail') || '';
  // 把網址的 ?profile=... 拿掉
  window.location.href = '/';
}

// 登入成功
function handleAuthSuccess(email) {
  userEmail.value = email;
  isAuthenticated.value = true;
  localStorage.setItem('tripplanner_userEmail', email);

  syncViewEmailFromURL();
}

// 新增/編輯行程後刷新右邊列表
function handleItineraryUpdate() {
  refreshKey.value++;
}

// 登出
function handleLogout() {
  isAuthenticated.value = false;
  userEmail.value = null;
  viewEmail.value = null;
  refreshKey.value = 0;
  localStorage.removeItem('tripplanner_userEmail');
}

// 畫面上實際顯示的 email (誰的卡 & 誰的行程)
const effectiveEmail = computed(() => viewEmail.value || userEmail.value || '');

// 我是不是在看別人
const isViewingSomeoneElse = computed(() => {
  return (
      userEmail.value &&
      effectiveEmail.value &&
      userEmail.value !== effectiveEmail.value
  );
});

// ItineraryManager 回報「這個 user 沒行程/不存在」
function handleNoData() {
  if (isViewingSomeoneElse.value) {
    alert("This user has no trips or does not exist. Returning to homepage.");
    window.location.href = "/";
  }
}

// 頁面載入時：從 localStorage 自動登入 + 決定 viewEmail
onMounted(() => {
  const savedEmail = localStorage.getItem('tripplanner_userEmail');
  if (savedEmail && savedEmail.includes('@')) {
    userEmail.value = savedEmail;
    isAuthenticated.value = true;
  }
  syncViewEmailFromURL();
});

// 如果登入了，而且網址沒有指定 profile，就把 viewEmail 綁回自己
watch(userEmail, () => {
  const params = new URLSearchParams(window.location.search);
  const qEmail = params.get('profile');
  if (!qEmail) {
    viewEmail.value = userEmail.value;
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-1 md:p-2">
    <!-- Header -->
    <header class="bg-indigo-600 text-white p-2 rounded-lg shadow-lg mb-4 flex justify-between items-center">
      <h1 class="text-2xl font-bold flex items-center space-x-2">
        <span>Trip Planner</span>

        <!-- 只有在看別人的時候顯示 badge -->
        <span
            v-if="isAuthenticated && isViewingSomeoneElse"
            class="text-xs font-normal bg-white/20 rounded px-2 py-0.5"
        >
          viewing {{ effectiveEmail }}
        </span>
      </h1>

      <div v-if="userEmail" class="flex items-center space-x-3">
        <p class="text-sm">{{ userEmail }}</p>
        <button
            @click="handleLogout"
            class="py-1 px-3 bg-red-400 text-white text-sm font-semibold rounded-md hover:bg-red-500 transition shadow-sm"
        >
          Logout
        </button>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
      <!-- 未登入狀態 -->
      <div v-if="!isAuthenticated" class="lg:col-span-12">
        <div class="lg:col-span-12 space-y-6">
          <!-- Info Card -->
          <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 class="text-2xl font-bold mb-4 text-gray-800">Trip Planner</h2>
            <div class="space-y-1 text-gray-700">
              <p><strong>Team name:</strong> <span class="text-indigo-600">Kenting 🏖️</span></p>
              <p><strong>Team member:</strong> Po-Chun Lu</p>
              <p><strong>Professor:</strong> Dr. Markus Eilsperger</p>
            </div>
          </div>

          <!-- Login/Register -->
          <AuthAndCreate @auth-success="handleAuthSuccess" />
        </div>
      </div>

      <!-- 登入後畫面 -->
      <template v-else>
        <!-- 左側 -->
        <div class="lg:col-span-5 space-y-6">

          <!-- Info card -->
          <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 class="text-2xl font-bold mb-4 text-gray-800 text-center">Trip Planner</h2>
            <div class="space-y-1 text-gray-700 text-center md:text-left">
              <p><strong>Team name:</strong> <span class="text-indigo-600">Kenting 🏖️</span></p>
              <p><strong>Team member:</strong> Po-Chun Lu</p>
              <p><strong>Professor:</strong> Dr. Markus Eilsperger</p>
            </div>
          </div>

          <!-- 如果是自己 -> 顯示建立新行程表單 -->
          <AuthAndCreate
              v-if="!isViewingSomeoneElse"
              :userEmail="userEmail"
              :isAuthenticated="isAuthenticated"
              @itinerary-updated="handleItineraryUpdate"
          />

          <!-- 如果在看別人 -> 顯示提醒卡 -->
          <div
              v-else
              class="bg-yellow-50 text-yellow-800 text-sm rounded-xl border border-yellow-300 shadow p-6"
          >
            <p class="font-semibold text-yellow-700 text-center">
              Viewing {{ effectiveEmail }}'s trips
            </p>

            <button
                class="mt-4 w-full py-2 px-4 bg-yellow-400 text-black font-semibold rounded-md hover:bg-yellow-500 transition shadow-sm"
                @click="goHome"
            >
              Go to Homepage
            </button>
          </div>
        </div>

        <!-- 右側 -->
        <div class="lg:col-span-7 space-y-4">
          <!-- 個人資料卡：頭貼 + email -->
          <ProfileCard :userEmail="effectiveEmail" />

          <!-- 行程列表 / 詳情 -->
          <ItineraryManager
              :travellerEmail="effectiveEmail"
              :currentUserEmail="userEmail"
              :refreshSignal="refreshKey"
              @no-data="handleNoData"
          />
        </div>
      </template>
    </div>
  </div>
</template>