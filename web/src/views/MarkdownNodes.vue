<template>
  <div>
    <template v-for="(node, index) in nodes" :key="index">
      <h1 v-if="node.type === 'heading' && node.level === 1" class="doc-h1"><Spans :spans="node.spans" /></h1>
      <h2 v-else-if="node.type === 'heading' && node.level === 2" class="doc-h2"><Spans :spans="node.spans" /></h2>
      <h3 v-else-if="node.type === 'heading' && node.level === 3" class="doc-h3"><Spans :spans="node.spans" /></h3>
      <h4 v-else-if="node.type === 'heading'" class="doc-h4"><Spans :spans="node.spans" /></h4>

      <p v-else-if="node.type === 'paragraph'" class="doc-p"><Spans :spans="node.spans" /></p>

      <blockquote v-else-if="node.type === 'quote'" class="doc-quote"><Spans :spans="node.spans" /></blockquote>

      <ul v-else-if="node.type === 'list' && !node.ordered" class="doc-list">
        <li v-for="(item, i) in node.items" :key="i"><Spans :spans="item.spans" /></li>
      </ul>
      <ol v-else-if="node.type === 'list'" class="doc-list">
        <li v-for="(item, i) in node.items" :key="i"><Spans :spans="item.spans" /></li>
      </ol>

      <table v-else-if="node.type === 'table'" class="doc-table">
        <thead>
          <tr>
            <th v-for="(cell, i) in node.headers" :key="i">{{ cell.map((s) => s.text).join("") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in node.rows" :key="ri">
            <td v-for="(cell, ci) in row" :key="ci">{{ cell.map((s) => s.text).join("") }}</td>
          </tr>
        </tbody>
      </table>

      <img v-else-if="node.type === 'image'" class="doc-img" :src="node.src" :alt="node.alt" loading="lazy" />

      <pre v-else-if="node.type === 'code'" class="doc-code"><code>{{ node.text }}</code></pre>

      <hr v-else-if="node.type === 'hr'" />
    </template>
  </div>
</template>

<script setup>
import { h } from "vue";

defineProps({ nodes: { type: Array, required: true } });

/** 行内 spans 渲染（粗体/斜体/代码/链接） */
const Spans = {
  props: { spans: { type: Array, default: () => [] } },
  setup(props) {
    return () =>
      props.spans.map((span, index) => {
        if (span.link) {
          const href = span.link.href;
          if (href.startsWith("content://")) {
            const id = href.slice("content://".length);
            return h(
              "a",
              { key: index, href: `#/course/${encodeURIComponent(id)}` },
              span.text,
            );
          }
          return h(
            "a",
            { key: index, href, target: /^https?:\/\//.test(href) ? "_blank" : undefined },
            span.text,
          );
        }
        const props = { key: index };
        if (span.bold) props.style = { fontWeight: 700 };
        if (span.italic) props.style = { ...props.style, fontStyle: "italic" };
        if (span.code) props.class = "inline-code";
        return h("span", props, span.text);
      });
  },
};
</script>

<style scoped>
.doc-h1 { font-size: 26px; margin: 16px 0 8px; }
.doc-h2 { font-size: 21px; margin: 20px 0 8px; }
.doc-h3 { font-size: 17px; margin: 16px 0 6px; }
.doc-h4 { font-size: 15px; margin: 14px 0 6px; }
.doc-p { line-height: 1.8; margin: 10px 0; }
.doc-quote {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 4px solid var(--td-brand-color);
  background: var(--td-brand-color-light);
  color: #43564b;
}
.doc-list { line-height: 1.8; padding-left: 22px; }
.doc-table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
.doc-table th, .doc-table td { border: 1px solid var(--td-component-stroke); padding: 8px 10px; text-align: left; }
.doc-table th { background: var(--td-brand-color-light); }
.doc-img { max-width: 100%; border-radius: 10px; }
.doc-code {
  background: #17211b; color: #d5e2da; padding: 14px; border-radius: 10px;
  overflow-x: auto; font-size: 13px; white-space: pre-wrap;
}
:deep(.inline-code) {
  font-family: ui-monospace, monospace; font-size: 13px;
  background: #edf1ee; border-radius: 4px; padding: 1px 5px;
}
</style>
