<script setup>
import { ref, onMounted } from 'vue'

// props: 從父層(App.vue)拿 email
const props = defineProps({
  userEmail: {
    type: String,
    required: true
  }
})

// avatar 邏輯：和 ItineraryManager.vue 保持一致，避免大幅改動
const avatarUrl = ref('')
function onAvatarError() {
  avatarUrl.value = 'https://storage.googleapis.com/htwg-cloudapp-hw.firebasestorage.app/avatar/default.jpg'
}

onMounted(() => {
  if (props.userEmail) {
    avatarUrl.value = `https://storage.googleapis.com/htwg-cloudapp-hw.firebasestorage.app/avatar/${props.userEmail}.jpg`
  }
})
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col items-center text-center space-y-4">
    <img
        :src="avatarUrl"
        alt="User Avatar"
        class="w-24 h-24 rounded-full object-cover border border-gray-300 shadow-sm"
        @error="onAvatarError"
    />

    <div>
      <p class="text-sm text-gray-500">user</p>
      <p class="text-lg font-semibold text-gray-800 break-all">{{ userEmail }}</p>
    </div>
  </div>
</template>
