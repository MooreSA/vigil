<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchUserProfile, updateUserProfile } from '../lib/api';

const content = ref('');
const savedContent = ref('');
const timezone = ref('UTC');
const savedTimezone = ref('UTC');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saved = ref(false);

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Halifax',
  'America/Vancouver',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

const timezoneOptions = ref([...COMMON_TIMEZONES]);

const isDirty = () => content.value !== savedContent.value || timezone.value !== savedTimezone.value;

onMounted(async () => {
  try {
    const profile = await fetchUserProfile();
    content.value = profile.content;
    savedContent.value = profile.content;
    timezone.value = profile.timezone;
    savedTimezone.value = profile.timezone;

    // Ensure the current value appears in the dropdown even if it's not in COMMON_TIMEZONES
    if (!COMMON_TIMEZONES.includes(profile.timezone)) {
      timezoneOptions.value = [profile.timezone, ...COMMON_TIMEZONES];
    }
  } catch (_e) {
    error.value = 'Failed to load profile';
  } finally {
    loading.value = false;
  }
});

async function handleSave() {
  if (!isDirty()) return;
  saving.value = true;
  error.value = '';
  saved.value = false;

  try {
    const fields: { content?: string; timezone?: string } = {};
    if (content.value !== savedContent.value) fields.content = content.value;
    if (timezone.value !== savedTimezone.value) fields.timezone = timezone.value;

    const result = await updateUserProfile(fields);
    savedContent.value = result.content;
    savedTimezone.value = result.timezone;
    saved.value = true;
    window.setTimeout(() => { saved.value = false; }, 2000);
  } catch (_e) {
    error.value = 'Failed to save profile';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 min-w-0">
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-2xl mx-auto px-4 py-8">
        <div class="mb-6">
          <h1 class="text-xl font-semibold text-foreground tracking-tight mb-1">
            User Profile
          </h1>
          <p class="text-sm text-muted-foreground">
            Core facts about you that are included in every conversation. Use this for things the assistant should always know &mdash; your name, location, preferences, work context, etc.
          </p>
        </div>

        <div
          v-if="loading"
          class="text-sm text-muted-foreground py-8 text-center"
        >
          Loading...
        </div>

        <template v-else>
          <div class="mb-4">
            <label class="block text-sm font-medium text-foreground mb-1.5">Timezone</label>
            <select
              v-model="timezone"
              class="w-full rounded-xl bg-muted/50 border border-border/60 px-4 py-2.5 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:bg-muted/70 appearance-none cursor-pointer"
            >
              <option v-for="tz in timezoneOptions" :key="tz" :value="tz">{{ tz }}</option>
            </select>
            <p class="mt-1 text-xs text-muted-foreground">
              Used for cron schedules, timestamps, and the agent's clock.
            </p>
          </div>

          <textarea
            v-model="content"
            rows="20"
            placeholder="Write anything you want the assistant to always know about you.

Example:
- My name is Seamus
- I live in Dublin, Ireland
- I work as a software engineer at Acme Corp
- I prefer concise, direct responses
- My dog's name is Patches"
            class="w-full rounded-xl bg-muted/50 border border-border/60 px-4 py-3 text-sm text-foreground placeholder-muted-foreground/40 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:bg-muted/70 resize-y min-h-[200px] font-mono leading-relaxed"
          />

          <div class="flex items-center gap-3 mt-4">
            <button
              :disabled="!isDirty() || saving"
              class="px-4 py-2 rounded-xl text-sm font-medium transition-all
                     bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/20
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              @click="handleSave"
            >
              {{ saving ? 'Saving...' : 'Save' }}
            </button>

            <Transition
              enter-active-class="transition-opacity duration-200"
              leave-active-class="transition-opacity duration-200"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <span
                v-if="saved"
                class="text-sm text-green-500"
              >Saved</span>
            </Transition>

            <Transition
              enter-active-class="transition-opacity duration-200"
              leave-active-class="transition-opacity duration-200"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <span
                v-if="error"
                class="text-sm text-red-500"
              >{{ error }}</span>
            </Transition>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
