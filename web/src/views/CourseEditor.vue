<template>
  <div v-if="fatal" class="editor-fatal">
    <t-card :bordered="true">
      <strong>无法打开课程编辑器</strong>
      <p>{{ fatal }}</p>
      <t-button variant="outline" @click="backToLibrary">返回课程库</t-button>
    </t-card>
  </div>

  <div v-else-if="draft" class="course-editor">
    <header class="editor-hero">
      <div class="hero-left">
        <button type="button" class="back" data-testid="back-to-library" @click="backToLibrary">← 课程库</button>
        <h1 data-testid="editor-title">{{ displayTitle }}</h1>
        <span v-if="dirty" class="dirty-badge" data-testid="dirty-badge">未保存</span>
      </div>
      <t-button data-testid="save-course" theme="primary" size="large" :loading="submitting" @click="save">
        保存课程
      </t-button>
    </header>

    <div class="editor-top">
      <section class="panel info-panel">
        <h2>课程信息</h2>
        <label class="field">
          <span>课程标题（可选）</span>
          <input v-model="draft.workout.title" data-testid="course-title" type="text" maxlength="40" placeholder="留空时展示训练目的" @input="touch" />
        </label>
        <label class="field">
          <span>训练目的（必填）</span>
          <input
            v-model="draft.workout.goal"
            data-testid="course-goal"
            type="text"
            maxlength="40"
            placeholder="例：乳酸阈能力"
            :class="{ invalid: Boolean(errors.goal) }"
            @input="touch"
          />
          <small v-if="errors.goal" class="field-error" data-testid="goal-error">{{ errors.goal }}</small>
        </label>
        <label class="field">
          <span>课程备注（可选）</span>
          <textarea v-model="draft.workout.note" data-testid="course-note" rows="2" placeholder="使用场景、注意事项…" @input="touch" />
        </label>
        <div class="field-row">
          <label class="field">
            <span>强度分类</span>
            <select v-model="draft.category" data-testid="course-category" @change="touch">
              <option v-for="category in CATEGORY_ORDER" :key="category" :value="category">
                {{ category === "mixed" ? "混合刺激" : LIBRARY_CATEGORY_LABELS[category] }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>周跑量建议（可选）</span>
            <input v-model="draft.weeklyKmHint" data-testid="course-weekly" type="text" maxlength="30" placeholder="例：周跑量 ≥100km" @input="touch" />
          </label>
        </div>
        <p v-if="draft.source" class="muted">来源：{{ draft.source }}</p>
      </section>

      <section class="panel preview-panel">
        <h2>结构预览与汇总</h2>
        <StructurePreview
          :blocks="presentation.preview.blocks"
          :mixed-units="presentation.preview.mixedUnits"
          :compressed="presentation.preview.compressed"
        />
        <dl class="headline" data-testid="editor-headline">
          <div v-if="presentation.headline.durationLabel"><dt>已知时间</dt><dd>{{ presentation.headline.durationLabel }}</dd></div>
          <div v-if="presentation.headline.distanceLabel"><dt>已知距离</dt><dd>{{ presentation.headline.distanceLabel }}</dd></div>
          <div v-if="presentation.headline.workLabel"><dt>主训练</dt><dd>{{ presentation.headline.workLabel }}</dd></div>
          <div v-if="presentation.headline.recoveryLabel"><dt>恢复</dt><dd>{{ presentation.headline.recoveryLabel }}</dd></div>
          <div v-if="presentation.headline.restLabel"><dt>休息</dt><dd>{{ presentation.headline.restLabel }}</dd></div>
          <div><dt>步骤</dt><dd>{{ presentation.headline.stepCount }} 个 · {{ presentation.headline.repeatCount }} 个循环</dd></div>
        </dl>
      </section>
    </div>

    <section class="panel">
      <h2>步骤结构</h2>
      <WorkoutEditor
        :workout="draft.workout"
        @update:workout="applyWorkout"
        @error="showError"
      />
    </section>

    <p v-if="errorMessage" class="structure-error" data-testid="editor-error" role="alert">{{ errorMessage }}</p>

    <footer class="editor-footer">
      <span class="muted" data-testid="editor-totals">已知 {{ presentation.headline.durationLabel ?? "0 分钟" }} + {{ presentation.headline.distanceLabel ?? "0 米" }}</span>
      <div class="footer-actions">
        <t-button variant="outline" size="large" @click="backToLibrary">取消</t-button>
        <t-button data-testid="save-course-footer" theme="primary" size="large" :loading="submitting" @click="save">保存课程</t-button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CURRENT_WORKOUT_DSL_VERSION,
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  createDefaultWorkout,
  createLibraryCourseId,
  createLibraryCourse,
  createWorkoutPresentation,
  normalizeWorkout,
  parseWorkoutDsl,
  serializeWorkout,
  validateWorkout,
  workoutZones,
} from "@core";
import WorkoutEditor from "../components/WorkoutEditor.vue";
import StructurePreview from "../components/StructurePreview.vue";
import { takePendingDraft } from "../stores/course-draft.js";
import { findCustomCourse, upsertCustomCourse } from "../stores/course-library.js";

const route = useRoute();
const router = useRouter();

const CATEGORY_ORDER = LIBRARY_CATEGORIES;

const draft = ref(null);
const fatal = ref("");
const dirty = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const errors = ref({});

const displayTitle = computed(() => {
  const workout = draft.value?.workout;
  return workout?.title?.trim() || workout?.goal?.trim() || "新建课程";
});
const presentation = computed(() => createWorkoutPresentation(draft.value.workout));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function backToLibrary() {
  router.push({ path: "/library" });
}

/** 保存成功：回到课程库并定位到该课程所属分类，保证新课程可见 */
function backToLibraryWithCategory() {
  const category = draft.value?.category;
  router.push(category ? { path: "/library", query: { category } } : { path: "/library" });
}

function touch() {
  dirty.value = true;
  errors.value = {};
}

function showError(message) {
  errorMessage.value = message;
}

function applyWorkout(workout) {
  draft.value = { ...draft.value, workout };
  touch();
}

onMounted(() => {
  if (route.params.id) {
    const found = findCustomCourse(String(route.params.id));
    if (!found) {
      fatal.value = "找不到这门自定义课程，可能已被删除。";
      return;
    }
    draft.value = clone(found);
    return;
  }

  const source = String(route.query.source ?? "");
  const pending = takePendingDraft();
  if (source === "copy" || source === "import") {
    if (!pending) {
      // 刷新后页面级草稿丢失：不猜测内容，安全返回课程库
      fatal.value = "导入/复制的草稿已失效，正在返回课程库…";
      router.replace({ path: "/library", query: { notice: "draft-lost" } });
      return;
    }
    draft.value = source === "import"
      ? newDraft(pending.draft, { category: inferCategory(pending.draft), source: "导入" })
      : clone(pending.draft);
    dirty.value = true;
    return;
  }

  if (pending) {
    draft.value = clone(pending.draft);
    dirty.value = true;
    return;
  }

  draft.value = newDraft(createDefaultWorkout());
});

/**
 * 草稿不经过课程校验：新建/导入时训练目的允许暂时为空，保存时才做完整校验。
 * 标签留空，保存时由 core 依据分类与强度自动推导。
 */
function newDraft(workout, overrides = {}) {
  return {
    id: createLibraryCourseId(),
    origin: "custom",
    category: overrides.category ?? "mixed",
    tags: [],
    source: overrides.source ?? "自定义",
    workout: {
      ...clone(workout),
      dslVersion: workout.dslVersion ?? CURRENT_WORKOUT_DSL_VERSION,
    },
  };
}

/**
 * 依据主训练阶段的强度档位推断分类：单一档位直接采用，多档位归为混合刺激。
 * 热身与冷身通常都是 E，不参与分类判断。
 */
function inferCategory(workout) {
  const main = workout.phases?.find((phase) => phase.role === "main");
  const zones = workoutZones(main ? { ...workout, phases: [main] } : workout);
  return zones.length === 1 ? zones[0] : "mixed";
}

function save() {
  errorMessage.value = "";
  errors.value = {};

  const goal = String(draft.value.workout.goal ?? "").trim();
  if (goal === "") {
    errors.value = { goal: "训练目的不能为空：每次课程都必须明确目的。" };
    focusFirstError();
    return;
  }

  const workout = normalizeWorkout({
    ...clone(draft.value.workout),
    goal,
    dslVersion: draft.value.workout.dslVersion ?? CURRENT_WORKOUT_DSL_VERSION,
  });
  if (!workout.title?.trim()) delete workout.title;
  if (!workout.note?.trim()) delete workout.note;

  const issues = validateWorkout(workout);
  if (issues.length > 0) {
    errorMessage.value = issues.map((issue) => issue.message).join("\n");
    return;
  }

  let dsl;
  try {
    dsl = serializeWorkout(workout);
  } catch (error) {
    errorMessage.value = `无法导出为 DSL：${error instanceof Error ? error.message : "内容不完整"}`;
    return;
  }

  try {
    const reparsed = parseWorkoutDsl(dsl);
    if (stableStringify(normalizeWorkout(reparsed)) !== stableStringify(workout)) {
      errorMessage.value = "序列化往返校验失败：导出的 DSL 与课程结构不一致。";
      return;
    }
  } catch (error) {
    errorMessage.value = `往返校验失败：${error instanceof Error ? error.message : "无法重新解析"}`;
    return;
  }

  submitting.value = true;
  try {
    const course = createLibraryCourse({
      id: draft.value.id,
      origin: "custom",
      category: draft.value.category,
      weeklyKmHint: draft.value.weeklyKmHint?.trim() || undefined,
      source: draft.value.source || "自定义",
      workout,
      createdAt: draft.value.createdAt,
    });
    upsertCustomCourse(course);
    dirty.value = false;
    window.alert("课程已保存");
    backToLibraryWithCategory();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    submitting.value = false;
  }
}

function focusFirstError() {
  const input = document.querySelector('[data-testid="course-goal"]');
  input?.focus?.();
}

/** 与键顺序无关的稳定序列化，用于往返结构比对 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
</script>

<style scoped>
.course-editor { display: grid; gap: 16px; }
.editor-hero { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.hero-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.editor-hero h1 { margin: 0; font-size: 22px; }
.back { border: 1px solid var(--td-component-stroke); background: #fff; border-radius: 999px; padding: 5px 12px; cursor: pointer; font-size: 13px; }
.dirty-badge { padding: 2px 10px; border-radius: 999px; background: #fff4d6; border: 1px solid #e8c98b; color: #8b6a1f; font-size: 12px; }
.editor-top { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
.panel { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--td-component-stroke); border-radius: 12px; background: #fff; align-content: start; }
.panel h2 { margin: 0; font-size: 15px; }
.field { display: grid; gap: 4px; }
.field-row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
.field span { font-size: 12px; color: #607066; }
.field input, .field select, .field textarea {
  padding: 6px 9px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  font-family: inherit;
}
.field input.invalid { border-color: #d54941; box-shadow: 0 0 0 2px #fdecea; }
.field-error { color: #d54941; font-size: 12px; }
.headline { display: grid; gap: 6px; margin: 0; }
.headline > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.headline dt { color: #607066; font-size: 12px; }
.headline dd { margin: 0; font-variant-numeric: tabular-nums; }
.structure-error { margin: 0; padding: 12px 14px; color: #8e2d26; background: #fff1ef; border: 1px solid #efc3be; border-radius: 10px; white-space: pre-wrap; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 0 4px; }
.footer-actions { display: flex; gap: 10px; }
.editor-fatal { max-width: 520px; margin: 48px auto; display: grid; gap: 10px; }
.muted { color: #607066; font-size: 13px; margin: 0; }
@media (max-width: 900px) {
  .editor-top { grid-template-columns: minmax(0, 1fr); }
  .editor-footer { position: sticky; bottom: 0; padding-bottom: 12px; background: linear-gradient(transparent, #f7f7f5 30%); }
  .footer-actions { width: 100%; }
  .footer-actions > * { flex: 1; }
}
</style>
