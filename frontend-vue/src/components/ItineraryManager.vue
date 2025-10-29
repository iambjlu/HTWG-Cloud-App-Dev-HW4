<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const props = defineProps({
  travellerEmail: {
    type: String,
    required: true
  },
  currentUserEmail: {
    type: String,
    required: true
  },
  refreshSignal: Number
});

const emit = defineEmits(['no-data']);

/* ---------------- base state ---------------- */
const rawItineraries = ref([]);
const userItineraries = ref([]);
const loading = ref(false);
const error = ref('');

const selectedItinerary = ref(null);
const isEditing = ref(false);
const editForm = ref({});
const editMessage = ref('');

/* view mode: 全部(true) or 只看該使用者(false) */
const showAll = ref(false);

/* 搜尋欄 */
const filterText = ref('');
const filterStart = ref('');
const filterEnd = ref('');

/* ---------------- computed: 是否在看自己 ---------------- */
const isViewingSelf = computed(() => {
  const a = (props.travellerEmail || '').toLowerCase();
  const b = (props.currentUserEmail || '').toLowerCase();
  return a && b && a === b;
});

/* ---------------- 預設顯示模式 ----------------
   - 看自己: showAll = true  (首頁可以看到所有人)
   - 看別人: showAll = false (只能看對方)
   搜尋框保持空
*/
watch(
    [() => props.travellerEmail, () => props.currentUserEmail],
    () => {
      if (isViewingSelf.value) {
        showAll.value = true;
        filterText.value = '';
      } else {
        showAll.value = false;
        filterText.value = '';
      }
    },
    { immediate: true }
);

/* ---------------- 抓行程資料 ---------------- */
async function fetchItineraries() {
  error.value = '';
  loading.value = true;

  if (!props.travellerEmail) {
    loading.value = false;
    return;
  }

  try {
    // 後端目前回傳全部行程
    const response = await axios.get(
        `${API_BASE_URL}/api/itineraries/by-email/${props.travellerEmail}`
    );

    rawItineraries.value = response.data || [];

    const who = (props.travellerEmail || '').toLowerCase();

    userItineraries.value = rawItineraries.value.filter(it => {
      return (it.traveller_email || '').toLowerCase() === who;
    });

    // 看別人但對方沒行程 => 叫父層彈回首頁
    if (!isViewingSelf.value && userItineraries.value.length === 0) {
      emit('no-data');
    }

    // 如果 detail pane 正在看的行程不再可見列表裡，就清掉
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

/* 初次 / travellerEmail 變動就抓資料 */
watch(
    () => props.travellerEmail,
    (newEmail) => {
      if (newEmail) fetchItineraries();
    },
    { immediate: true }
);

/* 父層 refreshSignal -> 重抓 */
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

/* =======================================================
   LIKE SYSTEM (列表 + 詳細區共用，單一來源)
======================================================= */

// likeMap[tripId] = true/false (我有沒有按讚)
const likeMap = ref({});

// likeCountMap[tripId] = 數字
const likeCountMap = ref({});

// popup: 顯示誰按讚
const likeListVisible = ref(false);
const likeListUsers = ref([]);
const likeListTripId = ref(null);

// 載入某個行程的 like 狀態 (count + 我有沒有按)
async function loadLikeInfo(itineraryId) {
  if (!itineraryId) return;
  try {
    // 總數
    const countRes = await axios.get(
        `${API_BASE_URL}/api/itineraries/${itineraryId}/like/count`
    );
    likeCountMap.value[itineraryId] = countRes.data.count ?? 0;

    // 全部email -> 用來判斷 "我有沒有按"
    const listRes = await axios.get(
        `${API_BASE_URL}/api/itineraries/${itineraryId}/like/list`
    );
    const users = listRes.data.users || [];
    likeMap.value[itineraryId] = users.some(
        u => u.email === props.currentUserEmail
    );
  } catch (err) {
    console.error('Failed to load like info', err);
    if (likeCountMap.value[itineraryId] === undefined) {
      likeCountMap.value[itineraryId] = 0;
    }
    if (likeMap.value[itineraryId] === undefined) {
      likeMap.value[itineraryId] = false;
    }
  }
}

// 幫目前畫面上所有 filtered trips 載入 like 狀態
async function loadLikesForVisibleTrips() {
  const ids = filteredItineraries.value.map(it => it.id);
  await Promise.all(ids.map(id => loadLikeInfo(id)));
}

// watch 列表變化 -> 重新載入likes
watch(filteredItineraries, () => {
  loadLikesForVisibleTrips();
});
// 初次載入 rawItineraries 時也載
watch(
    () => rawItineraries.value.length,
    () => {
      loadLikesForVisibleTrips();
    }
);

// 切讚
async function toggleLike(itineraryId) {
  if (!props.currentUserEmail) {
    alert('Please login first.');
    return;
  }
  try {
    const res = await axios.post(
        `${API_BASE_URL}/api/itineraries/${itineraryId}/like/toggle`,
        { userEmail: props.currentUserEmail }
    );

    const likedNow = !!res.data.liked;
    likeMap.value[itineraryId] = likedNow;

    if (likedNow) {
      likeCountMap.value[itineraryId] =
          (likeCountMap.value[itineraryId] || 0) + 1;
    } else {
      likeCountMap.value[itineraryId] =
          (likeCountMap.value[itineraryId] || 0) - 1;
      if (likeCountMap.value[itineraryId] < 0) {
        likeCountMap.value[itineraryId] = 0;
      }
    }

    // 如果我正好在看這個詳細頁，順便同步右邊角落顯示
    if (
        selectedItinerary.value &&
        selectedItinerary.value.id === itineraryId
    ) {
      // no extra call, we already updated the refs above
    }

  } catch (err) {
    console.error('Toggle like failed', err);
    alert('Like failed.');
  }
}

// 顯示誰按讚的清單
async function showLikeList(itineraryId) {
  try {
    const res = await axios.get(
        `${API_BASE_URL}/api/itineraries/${itineraryId}/like/list`
    );
    likeListUsers.value = res.data.users || [];
    likeListTripId.value = itineraryId;
    likeListVisible.value = true;
  } catch (err) {
    console.error('Failed to load like list', err);
    alert('Failed to load who liked this.');
  }
}

function closeLikeList() {
  likeListVisible.value = false;
  likeListTripId.value = null;
  likeListUsers.value = [];
}

/* ---------------- 查看詳細 ---------------- */
async function viewDetails(id) {
  error.value = '';
  editMessage.value = '';
  isEditing.value = false;

  try {
    const response = await axios.get(`${API_BASE_URL}/api/itineraries/detail/${id}`);
    const data = response.data;

    // 如果只允許看特定使用者
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

    selectedItinerary.value = data;
    editForm.value = { ...data };

    // 同步 likes 資訊（右邊 detail 也要最新）
    await loadLikeInfo(id);

  } catch (e) {
    error.value = 'Unable to load trip detail.';
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

/* ---------------- 切換顯示按鈕 ---------------- */
function viewOnlyThisUser() {
  showAll.value = false;
  filterText.value = '';
}
function viewAllTrips() {
  if (!isViewingSelf.value) return;
  showAll.value = true;
  filterText.value = '';
}
</script>

<template>
  <div class="grid grid-cols-1 lg gap-6 items-start">
    <!-- GLOBAL like-list popup -->
    <div
        v-if="likeListVisible"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="closeLikeList"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm p-4">
        <div class="flex justify-between items-start mb-3">
          <h3 class="text-lg font-semibold text-gray-800">
            Likes
          </h3>
<!--          <button-->
<!--              class="text-gray-400 hover:text-gray-600 text-xl leading-none"-->
<!--              @click="closeLikeList"-->
<!--          >-->
<!--            ×-->
<!--          </button>-->
        </div>

        <div v-if="likeListUsers.length === 0" class="text-sm text-gray-500">
          Nobody yet.
        </div>

        <ul v-else class="space-y-2 max-h-48 overflow-y-auto">
          <li
              v-for="u in likeListUsers"
              :key="u.email"
              class="flex items-center justify-between text-sm text-gray-700 border-b pb-1"
          ><span class="break-all">
            <a
                :href="'/?profile=' + u.email"
                class="text-indigo-600 hover:underline">{{ u.email }}
              </a>
          </span>
            <span class="text-[10px] text-gray-400">
              {{ new Date(u.liked_at).toLocaleString() }}
            </span>
          </li>
        </ul>

        <div class="mt-4 flex justify-end">
          <button
              class="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              @click="closeLikeList"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- LIST -->
    <div
        class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]"
    >
      <!-- Header -->
      <div
          class="flex justify-between items-start border-b pb-3 mb-4 flex-col md:flex-row md:items-center"
      >
        <div class="flex flex-col">
          <div class="flex items-center space-x-2">
            <h2 class="text-xl font-semibold text-gray-800">Trips</h2>

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
          <p
              v-if="error && !loading"
              class="text-red-600 text-sm font-medium mt-1"
          >
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

      <!-- Search Row -->
      <div
          class="mb-4 flex flex-col md:flex-row md:items-center md:space-x-3 space-y-3 md:space-y-0"
      >
        <div class="flex items-center flex-grow space-x-2">
          <label
              class="text-sm font-medium text-gray-700 whitespace-nowrap"
          >Search:</label
          >
          <input
              type="text"
              v-model="filterText"
              placeholder="Search trips..."
              class="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>

        <div class="flex items-center justify-end space-x-2 shrink-0">
          <button
              type="button"
              class="py-2 px-4 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition"
              @click="viewOnlyThisUser"
          >
            View Only This User
          </button>

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
            <span class="text-sm text-gray-500">
              (
              <a
                  :href="'/?profile=' + it.traveller_email"
                  class="text-indigo-600 hover:underline"
                  @click.stop
              >
                {{ it.traveller_email }}
              </a>
              )
            </span>
          </p>

          <!-- second line: desc + dates -->
          <p class="text-sm text-gray-600">
            {{ it.short_description }}
            <span class="ml-1 text-xs text-gray-500">
              {{ it.start_date }} ~ {{ it.end_date }}
            </span>
          </p>

          <!-- like row -->
          <div class="flex items-center justify-start mt-2 text-xs text-gray-500">
            <div class="flex items-center space-x-2">
              <!-- 愛心按鈕 -->
              <button
                  class="flex items-center space-x-2 text-sm font-medium px-3 py-1.5 rounded-md border"
                  :class="likeMap[it.id]
                ? 'bg-gray-200 text-gray-800 border-gray-300 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'"
                  @click.stop="toggleLike(it.id)"
                  :title="likeMap[it.id] ? 'Unlike' : 'Like'"

              >
                <span class="text-lg leading-none mr-1">
                  {{ likeMap[it.id] ? '❤️' : '🤍' }}
                </span>
                <span class="font-medium">{{ likeMap[it.id] ? 'Liked' : 'Like' }}</span>
              </button>

              <!-- 數字（灰底圓角，黑字），點了看名單 -->
              <button
                  class="text-[11px] font-medium text-gray-800 bg-gray-200 rounded-full px-2 py-0.5 hover:bg-gray-300"
                  @click.stop="showLikeList(it.id)"
              >
                {{ likeCountMap[it.id] ?? 0 }}
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p v-else-if="!loading && !error" class="text-gray-500 italic">
        No result
      </p>
    </div>

    <!-- DETAIL -->
    <div
        class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto max-h-[80vh]"
    >
      <h2 v-if="!selectedItinerary" class="text-xl font-semibold text-gray-400">
        Select a trip to view details
      </h2>

      <div v-else>
        <!-- VIEW MODE -->
        <div v-if="!isEditing">
          <h2
              class="text-3xl font-bold mb-4 text-gray-800 border-b pb-2 text-center"
          >
            {{ selectedItinerary.title }}
          </h2>

          <div class="space-y-2 text-gray-700 text-center border-b pb-4">
            <p>
              <strong>Owner:</strong>
              <a
                  :href="'/?profile=' + selectedItinerary.traveller_email"
                  class="text-indigo-600 hover:underline"
              >
                {{ selectedItinerary.traveller_email }}
              </a>
            </p>
            <p><strong>Destination:</strong> {{ selectedItinerary.destination }}</p>
            <p><strong>Starting Date:</strong> {{ selectedItinerary.start_date }}</p>
            <p><strong>Ending Date:</strong> {{ selectedItinerary.end_date }}</p>
            <p><strong>Short Description:</strong> {{ selectedItinerary.short_description }}</p>
          </div>

          <div class="pt-4 border-b pb-4 text-center">
            <p class="font-semibold text-gray-800">Long Description:</p>
            <p class="whitespace-pre-wrap text-gray-700 mt-2">
              {{ selectedItinerary.detail_description }}
            </p>
          </div>

          <!-- ❤️ Like block (detail view uses same refs/maps) -->
          <div class="mt-4 flex flex-col items-center space-y-3">
            <div class="space-y-3"></div>
            <button
                @click="toggleLike(selectedItinerary.id)"
                class="flex items-center space-x-2 text-sm font-medium px-3 py-1.5 rounded-md border"
                :class="likeMap[selectedItinerary.id]
                ? 'bg-gray-200 text-gray-800 border-gray-300 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'"
            >
              <span class="text-lg leading-none">
                {{ likeMap[selectedItinerary.id] ? '❤️' : '🤍' }}
              </span>
              <span>{{ likeMap[selectedItinerary.id] ? 'Liked' : 'Like' }}</span>
            </button>
            <button
                class="text-[11px] font-medium text-gray-800 bg-gray-200 rounded-full px-2 py-0.5 hover:bg-gray-300"
                @click="showLikeList(selectedItinerary.id)"
            >
              {{ likeCountMap[selectedItinerary.id] ?? 0 }}
              {{ (likeCountMap[selectedItinerary.id] ?? 0) === 1 ? 'like' : 'likes' }}
            </button>
          </div>

          <!-- edit / delete -->
          <div class="flex space-x-3 mt-6 border-t pt-4 justify-center">
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

        <!-- EDIT MODE -->
        <div v-else>
          <h3
              class="text-2xl font-bold mb-4 text-gray-800 border-b pb-2 text-center"
          >
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

            <div class="flex space-x-3 pt-2 justify-center">
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
                class="mt-3 text-sm font-medium text-center"
            >
              {{ editMessage }}
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>