<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import axios from 'axios';
// 獲取環境變數中的 API 基礎 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// --- 狀態管理 ---
const props = defineProps({
    // 從父元件傳入當前用戶的 Email 作為鍵
    travellerEmail: {
        type: String,
        required: true
    },
    // 從父元件傳入一個訊號，當行程被新增時觸發列表刷新
    refreshSignal: Number
});

const itineraries = ref([]);
const loading = ref(false);
const error = ref('');

const selectedItinerary = ref(null);
const isEditing = ref(false);
const editForm = ref({});
const editMessage = ref('');

const filterText = ref('');
const filterStart = ref('');
const filterEnd = ref('');

// --- 資料獲取與列表 ---
const fetchItineraries = async () => {
    error.value = '';
    loading.value = true;
    // selectedItinerary.value = null; // 載入時不清除當前選中的詳情，避免閃爍

    if (!props.travellerEmail) {
        error.value = 'Unable to load trips. Please re-login';
        loading.value = false;
        return;
    }

    try {
        // 使用新的 API 呼叫：從 Email 查詢
        const response = await axios.get(`${API_BASE_URL}/api/itineraries/by-email/${props.travellerEmail}`);
        itineraries.value = response.data;
    } catch (e) {
        // 修正錯誤訊息，現在後端已經支持該路由
        error.value = 'Unable to load trips. Check your Internet connection.';
    } finally {
        loading.value = false;
    }
};

// 監聽 travellerEmail 變化和 refreshSignal 變化以刷新列表
watch(() => props.travellerEmail, (newEmail) => {
    if (newEmail) {
        fetchItineraries();
    }
}, { immediate: true });

watch(() => props.refreshSignal, () => {
    fetchItineraries();
});

const filteredItineraries = computed(() => {
    const text = filterText.value.trim().toLowerCase();
    const start = filterStart.value ? new Date(filterStart.value) : null;
    const end = filterEnd.value ? new Date(filterEnd.value) : null;

    return itineraries.value.filter((it) => {
        const t = (it.title || '').toLowerCase();
        const d = (it.destination || '').toLowerCase();
        const s = (it.short_description || '').toLowerCase();
        const l = (it.detail_description || '').toLowerCase();
        const textOk = !text || [t, d, s, l].some(v => v.includes(text));

        const itStart = it.start_date ? new Date(it.start_date) : null;
        const itEnd = it.end_date ? new Date(it.end_date) : itStart;

        let dateOk = true;
        if (start && end) {
            // overlap between [itStart, itEnd] and [start, end]
            dateOk = !(itEnd && itEnd < start) && !(itStart && itStart > end);
        } else if (start) {
            dateOk = !itEnd || itEnd >= start;
        } else if (end) {
            dateOk = !itStart || itStart <= end;
        }

        return textOk && dateOk;
    });
});


// --- 詳情與編輯功能 ---
const viewDetails = async (id) => {
    error.value = '';
    editMessage.value = '';
    isEditing.value = false;
    // selectedItinerary.value = null; // 載入前不清除，避免閃爍

    try {
        const response = await axios.get(`${API_BASE_URL}/api/itineraries/detail/${id}`);
        selectedItinerary.value = response.data;
        // 初始化編輯表單
        editForm.value = { ...response.data };
    } catch (e) {
        error.value = 'Unable to load trip detail.';
    }
};

const startEdit = () => {
    isEditing.value = true;
};

const cancelEdit = () => {
    isEditing.value = false;
    editForm.value = { ...selectedItinerary.value }; // 恢復原始數據
};

const saveEdit = async () => {
    editMessage.value = '';
    const data = editForm.value;

    if (data.short_description.length > 80) {
        editMessage.value = 'Short Description should not longer than 80 letters.';
        return;
    }

    try {
        await axios.put(`${API_BASE_URL}/api/itineraries/${data.id}`, data);
        editMessage.value = 'Successfully updated';
        isEditing.value = false;
        await viewDetails(data.id); // 刷新詳情
        fetchItineraries(); // 刷新列表 (以防標題/日期改變)
    } catch (e) {
        editMessage.value = 'Update failed. Server error.';
    }
};

// --- 刪除功能 ---
const deleteItinerary = async () => {
    // ⚠️ 注意：在 Canvas 環境中，使用 custom modal UI 替代瀏覽器原生的 confirm() 或 alert()
    if (!selectedItinerary.value) return;

    // 這裡使用 window.confirm/alert 進行快速原型設計，實際應替換為 Custom Modal
    if (window.confirm(`Delete trip "${selectedItinerary.value.title}" ?`)) {
         try {
            await axios.delete(`${API_BASE_URL}/api/itineraries/${selectedItinerary.value.id}`);
            window.alert('Deleted!'); // 實際應用中應替換為 custom modal
            selectedItinerary.value = null; // 清除詳情
            fetchItineraries(); // 刷新列表
        } catch (e) {
            window.alert('Delete failed'); // 實際應用中應替換為 custom modal
        }
    }
};
</script>

<template>
  <!-- 佈局修正：一律使用單欄 (grid-cols-1)，讓行程列表和詳情上下排列，不區分螢幕尺寸 -->
  <div class="grid grid-cols-1 gap-6 h-full">

    <!-- 行程列表 (佔滿寬度) -->
    <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]">
      <div class="flex justify-between items-center border-b pb-2 mb-4">
        <!-- 移除 Email 顯示 -->
        <h2 class="text-xl font-semibold text-gray-800">My trips</h2>
        <div class="flex items-center space-x-2">
            <button class="text-sm font-medium text-white-600 hover:text-white-800 transition" @click="fetchItineraries" title="Refresh">
                Refresh
            </button>
        </div>
      </div>

      <p v-if="loading" class="text-indigo-500">⏳ Loading ⏳</p>
      <p v-if="error" class="text-red-600">{{ error }}</p>

      <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input type="text" v-model="filterText" placeholder="Search title, destination, short/long description" class="p-2 border border-gray-300 rounded-md" />
<!--        <div class="flex gap-2">-->
<!--          <input type="date" v-model="filterStart" class="p-2 border border-gray-300 rounded-md" />-->
<!--          <input type="date" v-model="filterEnd" class="p-2 border border-gray-300 rounded-md" />-->
<!--        </div>-->
        <div class="flex items-center">
          <button type="button" class="py-2 px-4 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition" @click="filterText=''; filterStart=''; filterEnd='';">Clear</button>
        </div>
      </div>

      <ul class="space-y-2" v-if="filteredItineraries.length > 0">
        <li v-for="it in filteredItineraries" :key="it.id" @click="viewDetails(it.id)"
            :class="{'bg-indigo-50 border-indigo-400': selectedItinerary && selectedItinerary.id === it.id, 'bg-gray-50 border-gray-200 hover:bg-gray-100': !(selectedItinerary && selectedItinerary.id === it.id)}"
            class="p-3 border-l-4 rounded-md cursor-pointer transition duration-150 ease-in-out">
          <p class="font-semibold text-gray-800">{{ it.title }}</p>
          <p class="text-sm text-gray-600">{{ it.short_description }}</p>
          <p class="text-xs text-gray-500 mt-1">Starting date: {{ it.start_date }}</p>
        </li>
      </ul>
      <p v-else-if="!loading && !error" class="text-gray-500 italic">No trip yet.</p>
      <p v-if="!loading && !error && itineraries.length > 0 && filteredItineraries.length === 0" class="text-gray-500 italic">No trips match your filters.</p>
    </div>

    <!-- 行程詳情與編輯 (佔滿寬度) -->
    <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]">
        <h2 v-if="!selectedItinerary" class="text-xl font-semibold text-gray-400">Select a trip to view details</h2>

        <div v-if="selectedItinerary">
            <!-- 詳情模式 -->
            <div v-if="!isEditing">
                <h2 class="text-3xl font-bold mb-4 text-gray-800 border-b pb-2">{{ selectedItinerary.title }}</h2>
                <div class="space-y-2 text-gray-700">
                    <p><strong>Destination:</strong> {{ selectedItinerary.destination }}</p>
                    <p><strong>Starting Date:</strong> {{ selectedItinerary.start_date }}</p>
                    <p><strong>Ending Date:</strong> {{ selectedItinerary.end_date }}</p>
                    <p><strong>Short Description:</strong> {{ selectedItinerary.short_description }}</p>
                    <p class="mt-4 border-t pt-3"><strong>Long Description:</strong></p>
                    <p class="whitespace-pre-wrap">{{ selectedItinerary.detail_description }}</p>
                </div>

                <div class="flex space-x-3 mt-6 border-t pt-4">
                    <button class="py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 transition" @click="startEdit">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="py-2 px-4 rounded-md text-white bg-red-600 hover:bg-red-700 transition" @click="deleteItinerary">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>

            <!-- 編輯模式 -->
            <div v-else>
                <h3 class="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Edit trip: {{ editForm.title }}</h3>
                <form @submit.prevent="saveEdit" class="space-y-4">
                    <div class="flex flex-col">
                      <label for="editTitle" class="text-sm font-medium text-gray-700">Title:</label>
                      <input type="text" id="editTitle" v-model="editForm.title" required class="mt-1 p-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex flex-col">
                      <label for="editDestination" class="text-sm font-medium text-gray-700">Destination:</label>
                      <input type="text" id="editDestination" v-model="editForm.destination" required class="mt-1 p-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex flex-col">
                      <label for="editStartDate" class="text-sm font-medium text-gray-700">Starting Date:</label>
                      <input type="date" id="editStartDate" v-model="editForm.start_date" required class="mt-1 p-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex flex-col">
                      <label for="editEndDate" class="text-sm font-medium text-gray-700">Ending Date:</label>
                      <input type="date" id="editEndDate" v-model="editForm.end_date" required class="mt-1 p-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex flex-col">
                      <label for="editShortDesc" class="text-sm font-medium text-gray-700">Short Description:</label>
                      <input type="text" id="editShortDesc" v-model="editForm.short_description" maxlength="80" required class="mt-1 p-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex flex-col">
                      <label for="editDetailDesc" class="text-sm font-medium text-gray-700">Long Description:</label>
                      <textarea id="editDetailDesc" v-model="editForm.detail_description" rows="5" class="mt-1 p-2 border border-gray-300 rounded-md"></textarea>
                    </div>

                    <div class="flex space-x-3 pt-2">
                        <button class="py-2 px-4 rounded-md text-white bg-green-600 hover:bg-green-700 transition" type="submit">
                            Done
                        </button>
                        <button class="py-2 px-4 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition" type="button" @click="cancelEdit">
                            Cancel
                        </button>
                    </div>
                    <p :class="{'text-green-600': editMessage.includes('Successfully'), 'text-red-600': !editMessage.includes('Successfully')}" class="mt-3 text-sm font-medium">
                        {{ editMessage }}
                    </p>
                </form>
            </div>
        </div>
    </div>
  </div>
</template>
