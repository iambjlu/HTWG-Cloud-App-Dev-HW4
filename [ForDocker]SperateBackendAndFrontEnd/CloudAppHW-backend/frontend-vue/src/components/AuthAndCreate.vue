<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';
// 獲取環境變數中的 API 基礎 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const props = defineProps({
    userEmail: {
        type: String,
        default: null
    },
    isAuthenticated: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['auth-success', 'itinerary-updated']);

// --- 註冊/Login 狀態 (Auth) ---
const authEmail = ref('');
const authName = ref('');
const authMessage = ref('');

// 註冊 / 獲取 ID (使用 Email 作為唯一鍵)
const register = async () => {
    authMessage.value = '';
    
    // 簡單的 Email 格式檢查
    if (!authEmail.value || !authEmail.value.includes('@')) {
        authMessage.value = 'Invaild E-mail Address';
        return;
    }

    try {
        
        // 嘗試使用 Email 和 Name 進行註冊/Login 。
        const response = await axios.post(`${API_BASE_URL}/api/register`, {
            email: authEmail.value,
            // 如果 name 留空，使用 'Anonymous' 作為佔位符
            name: authName.value || 'Anonymous' 
        });
        
        const returnedEmail = authEmail.value;

        // 如果Successfully且沒有拋出錯誤，則視為新的註冊Successfully，或後端已自動處理Login /更新
        authMessage.value = `Operation Successfully！User  Email: ${returnedEmail}。`;
        
        // 觸發Login Successfully事件，App.vue 將會更新狀態
        emit('auth-success', returnedEmail);

    } catch (error) {
        // 檢查錯誤響應，判斷是否為「Email already exists」錯誤
        const errorMessage = error.response?.data?.message;
        
        if (errorMessage && errorMessage.includes('Email already exists')) {
            // 這是User Exist的錯誤，我們將其視為Successfully的Login 。
            const returnedEmail = authEmail.value;
            
            authMessage.value = `Login Successfully！User Email: ${returnedEmail}. (User Exist)`;
            emit('auth-success', returnedEmail);
            
        } else {
            // 處理其他註冊失敗或Server Error
            authMessage.value = `Operation Failed: ${errorMessage || 'Server Error'}`;
        }
    }
};

// --- 建立行程狀態 (Create) ---
const createTitle = ref('');
const createDestination = ref('');
const createStartDate = ref('');
const createEndDate = ref('');
const createShortDesc = ref('');
const createDetailDesc = ref('');
const createMessage = ref('');

const createItinerary = async () => {
    createMessage.value = '';

    if (createShortDesc.value.length > 80) {
        createMessage.value = 'Short Description should not longer than 80 letters.';
        return;
    }

    if (!props.userEmail) {
        createMessage.value = 'Please login or register.';
        return;
    }

    try {
        // 傳遞 traveller_email，假設後端已更新支持此欄位
        await axios.post(`${API_BASE_URL}/api/itineraries`, {
            traveller_email: props.userEmail,
            title: createTitle.value,
            destination: createDestination.value,
            start_date: createStartDate.value,
            end_date: createEndDate.value,
            short_description: createShortDesc.value,
            detail_description: createDetailDesc.value
        });

        createMessage.value = `Trip "${createTitle.value}" Created Successfully！`;

        createTitle.value = createDestination.value = createStartDate.value = createEndDate.value = createShortDesc.value = createDetailDesc.value = '';

        // 觸發父元件重新載入行程列表
        emit('itinerary-updated');

    } catch (error) {
        console.error('Error creating trip: ', error);
        createMessage.value = 'Error creating trip.';
    }
};
</script>

<template>
  <div class="space-y-6">
    <!-- 註冊/Login 表單 (未認證時顯示) -->
    <div v-if="!isAuthenticated" class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Register or Login</h2>
      <form @submit.prevent="register" class="space-y-4">
        <div class="flex flex-col">
          <label for="authEmail" class="text-sm font-medium text-gray-700">E-mail</label>
          <input
            type="email"
            id="authEmail"
            v-model="authEmail"
            required
            class="mt-1 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Please enter your Email"
          >
        </div>
        <div class="flex flex-col">
          <label for="authName" class="text-sm font-medium text-gray-700">Name (for Register)</label>
          <input
            type="text"
            id="authName"
            v-model="authName"
            class="mt-1 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Please enter yourname"
          >
          <!-- 移除舊的提示文字，因為現在輸入名字也不會錯了 -->
          <p class="text-xs text-gray-500 mt-1">
            Auto register if account isn't exists。
          </p>
        </div>
        <button
          class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
          type="submit"
        >
          Register or Login
        </button>
      </form>
      <p :class="{'text-green-600': authMessage.includes('Successfully'), 'text-red-600': !authMessage.includes('Successfully')}" class="mt-3 text-sm font-medium">
          {{ authMessage }}
      </p>
    </div>

    <!-- 建立行程表單 (已認證時顯示) -->
    <div v-else class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Create new trip</h2>
      <!--<p class="text-sm text-gray-600 mb-4">當前操作 Email: <strong class="text-indigo-600">{{ userEmail }}</strong></p>-->

      <form @submit.prevent="createItinerary" class="space-y-4">
        <div class="flex flex-col">
          <label for="createTitle" class="text-sm font-medium text-gray-700">Title:</label>
          <input type="text" id="createTitle" v-model="createTitle" required class="mt-1 p-2 border border-gray-300 rounded-md">
        </div>
        <div class="flex flex-col">
          <label for="createDestination" class="text-sm font-medium text-gray-700">Destination:</label>
          <input type="text" id="createDestination" v-model="createDestination" required class="mt-1 p-2 border border-gray-300 rounded-md">
        </div>
        <div class="flex flex-col">
          <label for="createStartDate" class="text-sm font-medium text-gray-700">Starting Date:</label>
          <input type="date" id="createStartDate" v-model="createStartDate" required class="mt-1 p-2 border border-gray-300 rounded-md">
        </div>
        <div class="flex flex-col">
          <label for="createEndDate" class="text-sm font-medium text-gray-700">Ending Date:</label>
          <input type="date" id="createEndDate" v-model="createEndDate" required class="mt-1 p-2 border border-gray-300 rounded-md">
        </div>
        <div class="flex flex-col">
          <label for="createShortDesc" class="text-sm font-medium text-gray-700">Short Description:</label>
          <input type="text" id="createShortDesc" v-model="createShortDesc" maxlength="80" required class="mt-1 p-2 border border-gray-300 rounded-md">
        </div>
        <div class="flex flex-col">
          <label for="createDetailDesc" class="text-sm font-medium text-gray-700">Long Description:</label>
          <textarea id="createDetailDesc" v-model="createDetailDesc" rows="3" class="mt-1 p-2 border border-gray-300 rounded-md"></textarea>
        </div>
        
        <button 
          class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out" 
          type="submit"
        >Create
        </button>
      </form>
      <p :class="{'text-green-600': createMessage.includes('Successfully'), 'text-red-600': !createMessage.includes('Successfully')}" class="mt-3 text-sm font-medium">
          {{ createMessage }}
      </p>
    </div>
  </div>
</template>
