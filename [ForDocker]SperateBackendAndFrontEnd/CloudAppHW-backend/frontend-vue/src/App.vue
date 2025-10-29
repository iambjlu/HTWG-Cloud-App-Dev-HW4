<script setup>
import AuthAndCreate from './components/AuthAndCreate.vue';
import ItineraryManager from './components/ItineraryManager.vue';
import { ref } from 'vue';

// --- Authentication State ---
const isAuthenticated = ref(false);
const userEmail = ref(null);
const refreshKey = ref(0); // For triggering itinerary refresh

const handleAuthSuccess = (email) => {
    userEmail.value = email;
    isAuthenticated.value = true;
};

const handleItineraryUpdate = () => {
    refreshKey.value++;
};

// 登出邏輯 (將狀態重置)
const handleLogout = () => {
    isAuthenticated.value = false;
    userEmail.value = null;
    refreshKey.value = 0;
};
</script>

<template>
  <!-- 修正外層邊距：將 p-4 md:p-8 縮小為 p-2 md:p-4，減少最上方空間 -->
  <div class="min-h-screen bg-gray-100 p-1 md:p-2">
    <!-- 標題欄 (Header) -->
    <header class="bg-indigo-600 text-white p-2 rounded-lg shadow-lg mb-4 flex justify-between items-center">
      <h1 class="text-2xl font-bold">Trip Planner</h1>
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

    <!-- 主內容區 -->
    <!-- 縮小標題與內容區之間的邊距 mb-6 改為 mb-4 -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
      
      <!-- 未登入/未註冊時顯示 AuthAndCreate (僅顯示認證部分) -->
      <div v-if="!isAuthenticated" class="lg:col-span-12">
          <div class="lg:col-span-12 space-y-6">
              <!-- 資訊區塊 (可以保持顯示) -->
              <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                  <h2 class="text-2xl font-bold mb-4 text-gray-800">Trip Planner</h2>
                  <div class="space-y-1 text-gray-700">
                      <p><strong>Team name:</strong> <span class="text-indigo-600">Kenting 🏖️</span></p>
                      <p><strong>Team member:</strong> Po-Chun Lu</p>
                      <p><strong>Professor:</strong> Dr. Markus Eilsperger</p>
                  </div>
              </div>

              <!-- 登入/註冊元件 -->
              <AuthAndCreate @auth-success="handleAuthSuccess" />
          </div>
      </div>

      <!-- 登入/註冊成功後顯示完整介面 -->
      <template v-else>
          <!-- 左側面板 (佔據 5/12 欄位) -->
          <div class="lg:col-span-5 space-y-6">
              
              <!-- 資訊區塊 -->
              <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                  <h2 class="text-2xl font-bold mb-4 text-gray-800">Trip Planner</h2>
                  <div class="space-y-1 text-gray-700">
                      <p><strong>Team name:</strong> <span class="text-indigo-600">Kenting 🏖️</span></p>
                      <p><strong>Team member:</strong> Po-Chun Lu</p>
                      <p><strong>Professor:</strong> Dr. Markus Eilsperger</p>
                  </div>
              </div>

              <!-- 新增行程元件 (只顯示新增部分) -->
              <AuthAndCreate 
                  :userEmail="userEmail"
                  :isAuthenticated="isAuthenticated"
                  @itinerary-updated="handleItineraryUpdate" 
              />
          </div>
          
          <!-- 右側面板: 行程管理 (佔據 7/12 欄位) -->
          <div class="lg:col-span-7">
              <ItineraryManager :travellerEmail="userEmail" :refreshSignal="refreshKey" />
          </div>
      </template>
      
    </div>
  </div>
</template>

<style>
/* 確保字體設定被保留 */
#app {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
}
</style>
