<template>
  <div v-if="loading" class="muted">加载中…</div>
  <template v-else>
    <div class="page-hero">
      <t-typography-title level="h4">{{ doc.title }}</t-typography-title>
    </div>

    <t-card :bordered="true">
      <MarkdownNodes :nodes="nodes" />
    </t-card>

    <div class="btn-row" style="margin-top: 16px">
      <t-button v-if="doc.previousId" variant="outline" @click="goTo(doc.previousId)">‹ 上一篇</t-button>
      <t-button v-if="doc.nextId" variant="outline" @click="goTo(doc.nextId)">下一篇 ›</t-button>
    </div>
  </template>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { getContentById, getContentIndex, renderMarkdown } from "@core";
import MarkdownNodes from "./MarkdownNodes.vue";

const props = defineProps({ id: { type: String, required: true } });
const loading = ref(true);
const doc = ref(null);
const nodes = ref([]);

function assetUrl(raw, sourcePath) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("cloud://")) return raw;
  const dir = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
  const segments = dir ? dir.split("/") : [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return `/course-images/${segments.join("/")}`;
}

function contentLink(href, sourcePath, idByPath) {
  if (!/\.md(?:[?#].*)?$/.test(href)) return href;
  const clean = href.replace(/[?#].*$/, "");
  const dir = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
  const segments = dir ? dir.split("/") : [];
  for (const part of clean.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  const id = idByPath.get(segments.join("/"));
  return id ? `content://${id}` : href;
}

function goTo(contentId) {
  const element = document.querySelector("#app");
  if (element) element.scrollTop = 0;
  window.location.hash = `/course/${encodeURIComponent(contentId)}`;
}

onMounted(async () => {
  const content = await getContentById(props.id);
  doc.value = content;
  const idByPath = new Map(getContentIndex().map((entry) => [entry.path, entry.id]));
  nodes.value = renderMarkdown(content.markdown, {
    resolveLink: (href) => contentLink(href, content.path, idByPath),
    resolveAsset: (raw) => assetUrl(raw, content.path),
  });
  loading.value = false;
});
</script>
