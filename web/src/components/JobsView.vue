<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  fetchJobs,
  fetchJob,
  createJob,
  updateJob,
  deleteJob,
  type Job,
  type JobRun,
} from '../lib/api';
import ConfirmDialog from './ConfirmDialog.vue';

const jobs = ref<Job[]>([]);
const loading = ref(true);
const error = ref('');

// Form state
const showForm = ref(false);
const editingId = ref<string | null>(null);
const formName = ref('');
const formSchedule = ref('');
const formPrompt = ref('');
const formNotify = ref(true);
const formEnabled = ref(true);
const formMaxRetries = ref(3);
const formSaving = ref(false);
const formError = ref('');

// Delete state
const deleteDialogOpen = ref(false);
const deleteTargetId = ref<string | null>(null);

// Run history state
const expandedJobId = ref<string | null>(null);
const runs = ref<JobRun[]>([]);
const runsLoading = ref(false);

onMounted(async () => {
  await loadJobs();
});

async function loadJobs() {
  loading.value = true;
  error.value = '';
  try {
    jobs.value = await fetchJobs();
  } catch (_e) {
    error.value = 'Failed to load jobs';
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  formName.value = '';
  formSchedule.value = '';
  formPrompt.value = '';
  formNotify.value = true;
  formEnabled.value = true;
  formMaxRetries.value = 3;
  formError.value = '';
}

function openCreateForm() {
  resetForm();
  showForm.value = true;
}

function openEditForm(job: Job) {
  editingId.value = job.id;
  formName.value = job.name;
  formSchedule.value = job.schedule ?? '';
  formPrompt.value = job.prompt ?? '';
  formNotify.value = job.notify;
  formEnabled.value = job.enabled;
  formMaxRetries.value = job.max_retries;
  formError.value = '';
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  resetForm();
}

async function handleSubmit() {
  formSaving.value = true;
  formError.value = '';

  const data = {
    name: formName.value,
    schedule: formSchedule.value || undefined,
    prompt: formPrompt.value || undefined,
    notify: formNotify.value,
    enabled: formEnabled.value,
    max_retries: formMaxRetries.value,
  };

  try {
    if (editingId.value) {
      const updated = await updateJob(editingId.value, data);
      const idx = jobs.value.findIndex((j) => j.id === editingId.value);
      if (idx !== -1) jobs.value[idx] = updated;
    } else {
      const created = await createJob(data);
      jobs.value.unshift(created);
    }
    showForm.value = false;
    resetForm();
  } catch (_e) {
    formError.value = editingId.value ? 'Failed to update job' : 'Failed to create job';
  } finally {
    formSaving.value = false;
  }
}

async function handleToggle(job: Job) {
  try {
    const updated = await updateJob(job.id, { enabled: !job.enabled });
    const idx = jobs.value.findIndex((j) => j.id === job.id);
    if (idx !== -1) jobs.value[idx] = updated;
  } catch (_e) {
    error.value = 'Failed to toggle job';
  }
}

function promptDelete(id: string) {
  deleteTargetId.value = id;
  deleteDialogOpen.value = true;
}

async function onDeleteConfirmed() {
  if (!deleteTargetId.value) return;
  try {
    await deleteJob(deleteTargetId.value);
    jobs.value = jobs.value.filter((j) => j.id !== deleteTargetId.value);
  } catch (_e) {
    error.value = 'Failed to delete job';
  } finally {
    deleteDialogOpen.value = false;
    deleteTargetId.value = null;
  }
}

async function toggleRuns(jobId: string) {
  if (expandedJobId.value === jobId) {
    expandedJobId.value = null;
    runs.value = [];
    return;
  }

  expandedJobId.value = jobId;
  runsLoading.value = true;
  try {
    const result = await fetchJob(jobId);
    runs.value = result.runs;
  } catch (_e) {
    runs.value = [];
  } finally {
    runsLoading.value = false;
  }
}

function formatRelativeTime(dateStr: string | null) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const future = diffMs > 0;

  const minutes = Math.floor(absDiffMs / (1000 * 60));
  const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));

  let label: string;
  if (minutes < 1) label = 'just now';
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d`;

  if (label === 'just now') return label;
  return future ? `in ${label}` : `${label} ago`;
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: string) {
  switch (status) {
    case 'completed': return 'text-green-500';
    case 'failed': return 'text-red-500';
    case 'running': return 'text-blue-500';
    default: return 'text-muted-foreground';
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 min-w-0">
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-2xl mx-auto px-4 py-8">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-foreground tracking-tight mb-1">
              Scheduled Jobs
            </h1>
            <p class="text-sm text-muted-foreground">
              Manage recurring tasks that run on a schedule.
            </p>
          </div>
          <button
            v-if="!showForm && !loading"
            class="px-3 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/20 transition-all"
            @click="openCreateForm"
          >
            New Job
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-sm text-muted-foreground py-8 text-center">
          Loading...
        </div>

        <!-- Error -->
        <div v-if="error" class="text-sm text-red-500 mb-4">
          {{ error }}
        </div>

        <!-- Create/Edit Form -->
        <div v-if="showForm" class="mb-6 rounded-xl border border-border/60 bg-card p-4">
          <h2 class="text-sm font-semibold text-foreground mb-4">
            {{ editingId ? 'Edit Job' : 'New Job' }}
          </h2>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <input
                v-model="formName"
                type="text"
                placeholder="Daily standup summary"
                class="w-full rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              >
            </div>

            <div>
              <label class="block text-xs font-medium text-muted-foreground mb-1">Schedule (cron)</label>
              <input
                v-model="formSchedule"
                type="text"
                placeholder="0 9 * * *"
                class="w-full rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono"
              >
            </div>

            <div>
              <label class="block text-xs font-medium text-muted-foreground mb-1">Prompt</label>
              <textarea
                v-model="formPrompt"
                rows="3"
                placeholder="What should the agent do when this job runs?"
                class="w-full rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y min-h-[80px]"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-muted-foreground mb-1">Max Retries</label>
              <input
                v-model.number="formMaxRetries"
                type="number"
                min="0"
                max="10"
                class="w-24 rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              >
            </div>

            <div class="flex items-center gap-6">
              <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  v-model="formNotify"
                  type="checkbox"
                  class="rounded border-border/60 text-primary focus:ring-primary/20"
                >
                Notify on completion
              </label>
              <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  v-model="formEnabled"
                  type="checkbox"
                  class="rounded border-border/60 text-primary focus:ring-primary/20"
                >
                Enabled
              </label>
            </div>
          </div>

          <div v-if="formError" class="text-sm text-red-500 mt-3">
            {{ formError }}
          </div>

          <div class="flex items-center gap-2 mt-4">
            <button
              :disabled="!formName.trim() || formSaving"
              class="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              @click="handleSubmit"
            >
              {{ formSaving ? 'Saving...' : editingId ? 'Update' : 'Create' }}
            </button>
            <button
              class="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              @click="cancelForm"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="!loading && jobs.length === 0 && !showForm"
          class="py-12 text-center"
        >
          <svg
            class="w-10 h-10 mx-auto mb-3 text-muted-foreground/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p class="text-sm text-muted-foreground mb-4">No scheduled jobs</p>
          <button
            class="px-3 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/20 transition-all"
            @click="openCreateForm"
          >
            Create your first job
          </button>
        </div>

        <!-- Job list -->
        <div v-if="!loading && jobs.length > 0" class="space-y-2">
          <div
            v-for="job in jobs"
            :key="job.id"
            class="rounded-xl border border-border/60 bg-card overflow-hidden"
          >
            <div class="flex items-center gap-3 px-4 py-3">
              <!-- Toggle -->
              <button
                class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                :class="job.enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                :title="job.enabled ? 'Disable' : 'Enable'"
                @click="handleToggle(job)"
              >
                <span
                  class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                  :class="job.enabled ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>

              <!-- Info -->
              <button
                class="flex-1 min-w-0 text-left"
                @click="toggleRuns(job.id)"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-foreground truncate">{{ job.name }}</span>
                  <span
                    v-if="!job.enabled"
                    class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    Paused
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span v-if="job.schedule" class="font-mono">{{ job.schedule }}</span>
                  <span v-if="job.next_run_at && job.enabled">Next: {{ formatRelativeTime(job.next_run_at) }}</span>
                  <span v-if="job.last_run_at">Last: {{ formatRelativeTime(job.last_run_at) }}</span>
                </div>
              </button>

              <!-- Actions -->
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  title="Edit"
                  @click="openEditForm(job)"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  class="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                  title="Delete"
                  @click="promptDelete(job.id)"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Run history (expanded) -->
            <div v-if="expandedJobId === job.id" class="border-t border-border/60 px-4 py-3 bg-muted/30">
              <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent Runs</h3>
              <div v-if="runsLoading" class="text-xs text-muted-foreground py-2">Loading...</div>
              <div v-else-if="runs.length === 0" class="text-xs text-muted-foreground py-2">No runs yet</div>
              <div v-else class="space-y-1.5">
                <div
                  v-for="run in runs"
                  :key="run.id"
                  class="flex items-center gap-3 text-xs py-1"
                >
                  <span :class="statusColor(run.status)" class="font-medium capitalize w-16">{{ run.status }}</span>
                  <span class="text-muted-foreground">{{ formatDateTime(run.scheduled_for) }}</span>
                  <span v-if="run.error" class="text-red-500 truncate flex-1" :title="run.error">{{ run.error }}</span>
                  <router-link
                    v-if="run.thread_id"
                    :to="`/${run.thread_id}`"
                    class="text-primary hover:underline ml-auto"
                  >
                    Thread
                  </router-link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    title="Delete this job?"
    description="This will permanently remove the job and its schedule. Run history will be preserved."
    confirm-label="Delete"
    @confirm="onDeleteConfirmed"
  />
</template>
