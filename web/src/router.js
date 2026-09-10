import { createRouter, createWebHashHistory } from "vue-router";
import TrainingCalendar from "./views/TrainingCalendar.vue";
import TrainingWeek from "./views/TrainingWeek.vue";
import TrainingDay from "./views/TrainingDay.vue";
import Library from "./views/Library.vue";
import Courses from "./views/Courses.vue";
import Course from "./views/Course.vue";
import Paces from "./views/Paces.vue";
import Fitness from "./views/Fitness.vue";
import Settings from "./views/Settings.vue";
import EditWorkout from "./views/EditWorkout.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/training", component: TrainingCalendar },
    { path: "/training/week", component: TrainingWeek, props: (route) => ({ date: route.query.date }) },
    { path: "/training/day", component: TrainingDay, props: (route) => ({ date: route.query.date }) },
    { path: "/courses", component: Courses },
    { path: "/course/:id", component: Course, props: true },
    { path: "/library", component: Library },
    { path: "/paces", component: Paces },
    { path: "/fitness", component: Fitness },
    { path: "/settings", component: Settings },
    { path: "/edit", component: EditWorkout, props: (route) => ({ planId: route.query.plan, dayId: route.query.day }) },
    { path: "/", redirect: "/training" },
  ],
});
