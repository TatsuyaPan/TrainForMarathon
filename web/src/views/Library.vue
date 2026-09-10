<template>
  <div class="library-page">
    <header class="library-hero">
      <div>
        <h1>课程库</h1>
        <p class="muted">
          选择、复制或创建适合自己的训练课程。强度色阶：E 绿 → M 黄绿 → T 黄 → I 红 → R 紫 → ST 淡紫。
          结构里的目标可以按<strong>强度</strong>（E/M/T/I/R/ST）或按当前能力的<strong>配速</strong>显示。
        </p>
        <DisplayModeSwitch />
      </div>
      <div class="hero-actions">
        <t-button data-testid="open-import" variant="outline" @click="importVisible = true">导入课程</t-button>
        <t-button data-testid="new-course" theme="primary" @click="createCourse">＋ 新建课程</t-button>
      </div>
    </header>

    <div v-if="storageError" class="storage-banner" data-testid="library-error" role="alert">
      <span>{{ storageError }}</span>
      <t-button data-testid="clear-invalid" size="small" variant="outline" @click="clearInvalid">清理无效本地数据</t-button>
    </div>

    <div v-if="notice" class="notice-banner" data-testid="library-notice" role="status">{{ notice }}</div>

    <nav class="category-row" aria-label="强度分类">
      <button
        v-for="category in CATEGORY_ORDER"
        :key="category"
        type="button"
        class="category-chip"
        :class="{ active: activeCategory === category }"
        :style="chipStyle(category, activeCategory === category)"
        :aria-pressed="activeCategory === category"
        :data-testid="`category-${category}`"
        @click="activeCategory = category"
      >
        {{ category === "mixed" ? "混合" : category }}
      </button>
      <span class="category-hint muted">{{ CATEGORY_LABELS[activeCategory] }}</span>
    </nav>

    <section class="library-section">
      <h2>我的课程</h2>
      <p v-if="customCourses.length === 0" class="empty-hint muted" data-testid="custom-empty">
        这个分类还没有自定义课程。<button type="button" class="link" @click="createCourse">新建课程</button>或<button type="button" class="link" @click="importVisible = true">导入课程</button>。
      </p>
      <CourseCard
        v-for="course in customCourses"
        :key="course.id"
        :course="course"
        @edit="editCourse"
        @copy="copyCourse"
        @delete="askDelete"
      />
    </section>

    <section class="library-section">
      <h2>内置课程</h2>
      <p v-if="builtinCourses.length === 0" class="empty-hint muted">这个分类暂时没有内置课程。</p>
      <CourseCard
        v-for="course in builtinCourses"
        :key="course.id"
        :course="course"
        @copy="copyCourse"
        @edit="editCourse"
        @delete="askDelete"
      />
    </section>

    <div v-if="pendingDelete" class="confirm-overlay" data-testid="delete-confirm" @click.self="pendingDelete = null">
      <div class="confirm-card" role="alertdialog" aria-modal="true">
        <h3>删除课程</h3>
        <p>确定删除「{{ deleteLabel }}」吗？删除后无法恢复。</p>
        <div class="confirm-actions">
          <t-button variant="outline" @click="pendingDelete = null">取消</t-button>
          <t-button data-testid="confirm-delete" theme="danger" @click="confirmDelete">删除</t-button>
        </div>
      </div>
    </div>

    <CourseImportDialog :visible="importVisible" @close="importVisible = false" @submit="submitImport" />
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  BUILTIN_COURSES,
  INTENSITY_COLORS,
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  cloneLibraryCourse,
  listCoursesByCategory,
} from "@core";
import CourseCard from "../components/CourseCard.vue";
import CourseImportDialog from "../components/CourseImportDialog.vue";
import DisplayModeSwitch from "../components/DisplayModeSwitch.vue";
import { setPendingDraft } from "../stores/course-draft.js";
import { clearCourseLibrary, readCourseLibrary, removeCustomCourse } from "../stores/course-library.js";
import { notifyError } from "../ui-feedback.js";

const router = useRouter();
const route = useRoute();

const CATEGORY_ORDER = LIBRARY_CATEGORIES;
const CATEGORY_LABELS = LIBRARY_CATEGORY_LABELS;

/** 保存课程后回到课程库时带上分类，避免新课程因为当前筛选而“看不见” */
function initialCategory() {
  const requested = String(route.query?.category ?? "");
  return CATEGORY_ORDER.includes(requested) ? requested : "T";
}

const activeCategory = ref(initialCategory());
const importVisible = ref(false);
const pendingDelete = ref(null);
const library = ref(readCourseLibrary());

const storageError = computed(() => library.value.error);
const notice = computed(() =>
  route.query?.notice === "draft-lost" ? "导入或复制的草稿已失效（页面刷新后不会保留），请重新开始。" : "",
);
const customCourses = computed(() => listCoursesByCategory(library.value.courses, activeCategory.value));
const builtinCourses = computed(() => listCoursesByCategory(BUILTIN_COURSES, activeCategory.value));
const deleteLabel = computed(() => {
  const course = pendingDelete.value;
  if (!course) return "";
  return course.workout.title?.trim() || course.workout.goal?.trim() || "未命名课程";
});

function reload() {
  library.value = readCourseLibrary();
}

function chipStyle(category, active) {
  const color = INTENSITY_COLORS[category] ?? "#5b6b7c";
  return active
    ? { background: color, borderColor: color, color: "#fff" }
    : { background: `${color}1f`, borderColor: color, color };
}

function createCourse() {
  router.push({ path: "/library/new" });
}

function editCourse(course) {
  router.push({ path: `/library/${course.id}/edit` });
}

function copyCourse(course) {
  let cloned;
  try {
    // 深拷贝由 core 负责：列表里的课程即使来自响应式对象也可以直接传入
    cloned = cloneLibraryCourse(course);
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "复制失败");
    return;
  }
  setPendingDraft(cloned, "copy");
  router.push({ path: "/library/new", query: { source: "copy", course: course.id } });
}

function submitImport(workout) {
  setPendingDraft(workout, "import");
  importVisible.value = false;
  router.push({ path: "/library/new", query: { source: "import" } });
}

function askDelete(course) {
  pendingDelete.value = course;
}

function confirmDelete() {
  const course = pendingDelete.value;
  if (course) removeCustomCourse(course.id);
  pendingDelete.value = null;
  reload();
}

function clearInvalid() {
  clearCourseLibrary();
  reload();
}
</script>

<style scoped>
.library-page { display: grid; gap: 16px; }
.library-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.library-hero h1 { margin: 0 0 4px; font-size: 24px; }
.library-hero .display-switch { margin-top: 8px; }
.hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.storage-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  color: #8e2d26;
  background: #fff1ef;
  border: 1px solid #efc3be;
  border-radius: 10px;
}
.notice-banner {
  padding: 10px 14px;
  color: #8b6a1f;
  background: #fff8e6;
  border: 1px solid #e8d3a0;
  border-radius: 10px;
}
.category-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.category-chip {
  padding: 4px 14px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
}
.category-chip.active { font-weight: 700; }
.category-hint { margin-left: 4px; }
.library-section { display: grid; gap: 10px; }
.library-section h2 { margin: 6px 0 0; font-size: 16px; }
.empty-hint { margin: 0; padding: 14px; border: 1px dashed var(--td-component-stroke); border-radius: 10px; background: #fafbf9; }
.link { border: none; background: none; padding: 0; color: #357a52; text-decoration: underline; cursor: pointer; font: inherit; }
.confirm-overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgba(23, 33, 27, 0.42); }
.confirm-card { width: min(420px, 100%); display: grid; gap: 10px; padding: 18px; border-radius: 14px; background: #fff; box-shadow: 0 24px 60px rgba(24, 63, 43, 0.28); }
.confirm-card h3 { margin: 0; font-size: 16px; }
.confirm-card p { margin: 0; color: #35424f; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
.muted { color: #607066; font-size: 13px; }
</style>
