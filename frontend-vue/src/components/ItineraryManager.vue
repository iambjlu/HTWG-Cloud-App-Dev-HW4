<!--ItineraryManager.vue-->
<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const props = defineProps({
  travellerEmail: {
    type: String,
    required: true
  },
  currentUserEmail: {           // 登入者 email
    type: String,
    required: true
  },
  refreshSignal: Number
});

const emit = defineEmits(['no-data']);

/* ---------------- state ---------------- */
const avatarUrl = ref('');
const rawItineraries = ref([]);       // 後端回的一整包 (全部人)
const userItineraries = ref([]);      // 只屬於 travellerEmail 的
const loading = ref(false);
const error = ref('');

const selectedItinerary = ref(null);
const isEditing = ref(false);
const editForm = ref({});
const editMessage = ref('');

// 顯示全站(true) or 顯示特定使用者(false)
const showAll = ref(false);

// 搜尋欄、日期篩選
const filterText = ref('');
const filterStart = ref('');
const filterEnd = ref('');

/* ---------------- computed: 現在是不是在看「自己」 ---------------- */
const isViewingSelf = computed(() => {
  const a = (props.travellerEmail || '').toLowerCase();
  const b = (props.currentUserEmail || '').toLowerCase();
  return a && b && a === b;
});

/* ---------------- avatar (外觀) ---------------- */
function onAvatarError() {
  avatarUrl.value = 'https://storage.googleapis.com/htwg-cloudapp-hw.firebasestorage.app/avatar/default.jpg';
}
onMounted(() => {
  if (props.travellerEmail) {
    avatarUrl.value = `https://storage.googleapis.com/htwg-cloudapp-hw.firebasestorage.app/avatar/${props.travellerEmail}.jpg`;
  }
});

/* ---------------- 預設顯示模式 ----------------
   - 看自己: showAll = true  (首頁可以看到所有人)
   - 看別人: showAll = false (只能看對方)
   搜尋框一律留空，不自動塞 email
*/
watch(
    [() => props.travellerEmail, () => props.currentUserEmail],
    () => {
      if (isViewingSelf.value) {
        showAll.value = true;   // 我 -> 全部
        filterText.value = '';  // 搜尋框預設空
      } else {
        showAll.value = false;  // 別人 -> 只看那個人
        filterText.value = '';  // 依你需求，不要自動塞對方 email
      }
    },
    { immediate: true }
);

// 🔥 把原本那個 "watch travellerEmail -> 塞搜尋框 email" 的 watcher 整段砍掉
// （你說不想預設帶 email，我們就不要塞）

/* ---------------- 抓行程資料 ---------------- */
async function fetchItineraries() {
  error.value = '';
  loading.value = true;

  if (!props.travellerEmail) {
    loading.value = false;
    return;
  }

  try {
    // 你的後端路由名是 /by-email/:email
    // 但目前回傳的是所有行程 (排序過)，我們就吃整包
    const response = await axios.get(
        `${API_BASE_URL}/api/itineraries/by-email/${props.travellerEmail}`
    );

    rawItineraries.value = response.data || [];

    const who = (props.travellerEmail || '').toLowerCase();

    // 把屬於目前正在看的 user's trips 抽出來
    userItineraries.value = rawItineraries.value.filter(it => {
      return (it.traveller_email || '').toLowerCase() === who;
    });

    // 如果我是在看別人，然後那個人完全沒行程 -> 回首頁
    if (!isViewingSelf.value && userItineraries.value.length === 0) {
      emit('no-data');
    }

    // 如果右側詳細面板目前選的行程不在「可見清單」裡，就清掉
    const visibleIds = new Set(
        (showAll.value ? rawItineraries.value : userItineraries.value).map(it => it.id)
    );
    if (selectedItinerary.value && !visibleIds.has(selectedItinerary.value.id)) {
      selectedItinerary.value = null;
      isEditing.value = false;
    }

  } catch (e) {
    error.value = 'Unable to load trips. Check your Internet connection.';
    if (!isViewingSelf.value) {
      emit('no-data');
    }
  } finally {
    loading.value = false;
  }
}

// 第一次 + travellerEmail 改變就抓資料
watch(
    () => props.travellerEmail,
    (newEmail) => {
      if (newEmail) fetchItineraries();
    },
    { immediate: true }
);

// 父層 refreshSignal -> 重抓
watch(
    () => props.refreshSignal,
    () => { fetchItineraries(); }
);

/* ---------------- 產生要顯示的清單：全部 or 單人 ---------------- */
const displayBaseList = computed(() => {
  return showAll.value ? rawItineraries.value : userItineraries.value;
});

/* ---------------- 搜尋 / 日期篩選後的清單 ---------------- */
const filteredItineraries = computed(() => {
  const text = filterText.value.trim().toLowerCase();
  const start = filterStart.value ? new Date(filterStart.value) : null;
  const end   = filterEnd.value   ? new Date(filterEnd.value)   : null;

  return displayBaseList.value.filter((it) => {
    const t = (it.title || '').toLowerCase();
    const d = (it.destination || '').toLowerCase();
    const s = (it.short_description || '').toLowerCase();
    const l = (it.detail_description || '').toLowerCase();
    const e = (it.traveller_email || '').toLowerCase();

    const matchText = !text || [t, d, s, l, e].some(v => v.includes(text));

    const itStart = it.start_date ? new Date(it.start_date) : null;
    const itEnd   = it.end_date   ? new Date(it.end_date)   : itStart;

    let matchDate = true;
    if (start && end) {
      matchDate = !(itEnd && itEnd < start) && !(itStart && itStart > end);
    } else if (start) {
      matchDate = !itEnd || itEnd >= start;
    } else if (end) {
      matchDate = !itStart || itStart <= end;
    }

    return matchText && matchDate;
  });
});

/* ---------------- 查看詳細 ---------------- */
async function viewDetails(id) {
  error.value = '';
  editMessage.value = '';
  isEditing.value = false;

  try {
    const response = await axios.get(`${API_BASE_URL}/api/itineraries/detail/${id}`);
    const data = response.data;
    await loadLikeStatus();
    // 如果現在是「不是 showAll」狀態（=只看某個人），
    // 就只能看該使用者擁有的行程，避免偷看別人的
    if (!showAll.value) {
      const who = (props.travellerEmail || '').toLowerCase();
      const ownerLower = (data.traveller_email || '').toLowerCase();
      if (ownerLower !== who) {
        selectedItinerary.value = null;
        editForm.value = {};
        error.value = 'You are not allowed to view this trip detail.';
        return;
      }
    }

    // showAll=true (首頁看自己 + 全站模式) -> 可以看細節
    selectedItinerary.value = data;
    editForm.value = { ...data };

  } catch (e) {
    error.value = 'Unable to load trip detail.';
  }

}

// --------- Like System ---------
const likeCount = ref(0);
const likedByMe = ref(false);
const likesPopupVisible = ref(false);
const likesList = ref([]);

async function loadLikeStatus() {
  if (!selectedItinerary.value) return;
  try {
    const res = await axios.get(
        `${API_BASE_URL}/api/itineraries/${selectedItinerary.value.id}/like-status`,
        { params: { userEmail: props.currentUserEmail } }
    );
    likeCount.value = res.data.count;
    likedByMe.value = res.data.liked;
  } catch (err) {
    console.error('Failed to load like status', err);
  }
}

async function toggleLike() {
  if (!selectedItinerary.value) return;
  const id = selectedItinerary.value.id;
  const email = props.currentUserEmail;

  try {
    if (likedByMe.value) {
      await axios.post(`${API_BASE_URL}/api/itineraries/${id}/unlike`, { userEmail: email });
      likedByMe.value = false;
      likeCount.value = Math.max(0, likeCount.value - 1);
    } else {
      await axios.post(`${API_BASE_URL}/api/itineraries/${id}/like`, { userEmail: email });
      likedByMe.value = true;
      likeCount.value++;
    }
  } catch (e) {
    console.error('Toggle like failed', e);
  }
}

async function showLikesList() {
  if (!selectedItinerary.value) return;
  try {
    const res = await axios.get(`${API_BASE_URL}/api/itineraries/${selectedItinerary.value.id}/likes-list`);
    likesList.value = res.data || [];
    likesPopupVisible.value = true;
  } catch (err) {
    alert('Failed to load likes list.');
  }
}

/* ---------------- 編輯 / 儲存 / 刪除 ---------------- */
function startEdit() {
  isEditing.value = true;
}
function cancelEdit() {
  isEditing.value = false;
  editForm.value = { ...selectedItinerary.value };
}

async function saveEdit() {
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
    await viewDetails(data.id);
    fetchItineraries();
  } catch (e) {
    editMessage.value = 'Update failed. Server error.';
  }
}

async function deleteItinerary() {
  if (!selectedItinerary.value) return;

  if (window.confirm(`Delete trip "${selectedItinerary.value.title}" ?`)) {
    try {
      await axios.delete(`${API_BASE_URL}/api/itineraries/${selectedItinerary.value.id}`);
      window.alert('Deleted!');
      selectedItinerary.value = null;
      fetchItineraries();
    } catch (e) {
      window.alert('Delete failed');
    }
  }
}

/* ---------------- 切換按鈕 ---------------- */
function viewOnlyThisUser() {
  showAll.value = false;
  // 不要預設塞 email 到搜尋欄
  filterText.value = '';
}

function viewAllTrips() {
  // 只有在看自己時才允許
  if (!isViewingSelf.value) return;

  showAll.value = true;
  filterText.value = '';
}
</script>

<template>
  <div class="grid grid-cols-1 lg gap-6 items-start">
    <!-- LIST -->
    <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]">
      <!-- Header -->
      <div class="flex justify-between items-start border-b pb-3 mb-4 flex-col md:flex-row md:items-center">
        <div class="flex flex-col">
          <div class="flex items-center space-x-2">
            <h2 class="text-xl font-semibold text-gray-800">Trips</h2>

            <!-- 模式 badge -->
            <span
                class="text-[11px] font-medium rounded px-2 py-0.5"
                :class="showAll
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                : 'bg-gray-100 text-gray-700 border border-gray-300'"
            >
              {{ showAll ? 'All users' : (isViewingSelf ? 'Only me' : 'This user only') }}
            </span>
          </div>

          <p v-if="loading" class="text-indigo-600 text-sm font-medium mt-1">
            ⏳ Loading ⏳
          </p>
          <p v-if="error && !loading" class="text-red-600 text-sm font-medium mt-1">
            {{ error }}
          </p>
        </div>

        <button
            class="mt-3 md:mt-0 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-md px-4 py-2 transition"
            @click="fetchItineraries"
        >
          Refresh
        </button>
      </div>

      <!-- Search / Filter Row -->
      <div class="mb-4 flex flex-col md:flex-row md:items-center md:space-x-3 space-y-3 md:space-y-0">
        <!-- Search box -->
        <div class="flex items-center flex-grow space-x-2">
          <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Search:</label>
          <input
              type="text"
              v-model="filterText"
              placeholder="Search trips..."
              class="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>

        <!-- Buttons -->
        <div class="flex items-center justify-end space-x-2 shrink-0">
          <!-- 只看這個使用者 -->
          <button
              type="button"
              class="py-2 px-4 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition"
              @click="viewOnlyThisUser"
          >
            View Only This User
          </button>

          <!-- 看全部：只有在看自己時可以按 -->
          <button
              type="button"
              class="py-2 px-4 rounded-md border transition"
              :class="isViewingSelf
              ? 'text-gray-800 bg-gray-100 border-gray-300 hover:bg-gray-200'
              : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed opacity-0'"
              @click="viewAllTrips"
          >
            View All Trips
          </button>
        </div>
      </div>

      <!-- Trips list -->
      <ul class="space-y-2" v-if="filteredItineraries.length > 0">
        <li
            v-for="it in filteredItineraries"
            :key="it.id"
            @click="viewDetails(it.id)"
            class="p-3 border-l-4 rounded-md cursor-pointer transition duration-150 ease-in-out"
            :class="{
            'bg-indigo-50 border-indigo-400': selectedItinerary && selectedItinerary.id === it.id,
            'bg-gray-50 border-gray-200 hover:bg-gray-100': !(selectedItinerary && selectedItinerary.id === it.id)
          }"
        >
          <p class="font-semibold text-gray-800">
            {{ it.title }}
            <span class="text-sm text-gray-500">(<a
                :href="'/?profile=' + it.traveller_email"
                class="text-indigo-600 hover:underline"
            >
              {{ it.traveller_email }}
            </a>)</span>
          </p>
          <p class="text-sm text-gray-600">{{ it.short_description }}</p>
          <p class="text-xs text-gray-500 mt-1">
            {{ it.start_date }} ~ {{ it.end_date }}
          </p>
        </li>
      </ul>

      <!-- No result -->
      <p v-else-if="!loading && !error" class="text-gray-500 italic">
        No result
      </p>
    </div>

    <!-- DETAIL -->
    <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]">
      <h2 v-if="!selectedItinerary" class="text-xl font-semibold text-gray-400">
        Select a trip to view details
      </h2>

      <div v-else>
        <!-- View -->
        <div v-if="!isEditing">
          <h2 class="text-3xl font-bold mb-4 text-gray-800 border-b pb-2">
            {{ selectedItinerary.title }}
          </h2>

          <div class="space-y-2 text-gray-700">
            <p><strong>Owner:</strong> <a
                :href="'/?profile=' + selectedItinerary.traveller_email"
                class="text-indigo-600 hover:underline"
            >
              {{ selectedItinerary.traveller_email }}
            </a></p>
            <p><strong>Destination:</strong> {{ selectedItinerary.destination }}</p>
            <p><strong>Starting Date:</strong> {{ selectedItinerary.start_date }}</p>
            <p><strong>Ending Date:</strong> {{ selectedItinerary.end_date }}</p>
            <p><strong>Short Description:</strong> {{ selectedItinerary.short_description }}</p>

            <p class="mt-4 border-t pt-3"><strong>Long Description:</strong></p>
            <p class="whitespace-pre-wrap">
              {{ selectedItinerary.detail_description }}
            </p>
          </div>

          <div class="flex space-x-3 mt-6 border-t pt-4">
            <button
                v-if="selectedItinerary.traveller_email === props.currentUserEmail"
                class="py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 transition"
                @click="startEdit"
            >
              Edit
            </button>

            <button
                v-if="selectedItinerary.traveller_email === props.currentUserEmail"
                class="py-2 px-4 rounded-md text-white bg-red-600 hover:bg-red-700 transition"
                @click="deleteItinerary"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Edit -->
        <div v-else>
          <h3 class="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">
            Edit trip: {{ editForm.title }}
          </h3>

          <form @submit.prevent="saveEdit" class="space-y-4">
            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Title:</label>
              <input
                  type="text"
                  v-model="editForm.title"
                  required
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              >
            </div>

            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Destination:</label>
              <input
                  type="text"
                  v-model="editForm.destination"
                  required
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              >
            </div>

            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Starting Date:</label>
              <input
                  type="date"
                  v-model="editForm.start_date"
                  required
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              >
            </div>

            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Ending Date:</label>
              <input
                  type="date"
                  v-model="editForm.end_date"
                  required
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              >
            </div>

            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Short Description:</label>
              <input
                  type="text"
                  v-model="editForm.short_description"
                  maxlength="80"
                  required
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              >
            </div>

            <div class="flex flex-col">
              <label class="text-sm font-medium text-gray-700">Long Description:</label>
              <textarea
                  v-model="editForm.detail_description"
                  rows="5"
                  class="mt-1 p-2 border border-gray-300 rounded-md"
              ></textarea>
            </div>

            <div class="flex space-x-3 pt-2">
              <button
                  class="py-2 px-4 rounded-md text-white bg-green-600 hover:bg-green-700 transition"
                  type="submit"
              >
                Done
              </button>

              <button
                  class="py-2 px-4 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition"
                  type="button"
                  @click="cancelEdit"
              >
                Cancel
              </button>
            </div>

            <p
                :class="{
                'text-green-600': editMessage.includes('Successfully'),
                'text-red-600': !editMessage.includes('Successfully')
              }"
                class="mt-3 text-sm font-medium"
            >
              {{ editMessage }}
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>