import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";


// Overall status for the entire video job
export const videoStatusEnum = pgEnum("video_status", [
  "PENDING",
  "GENERATING_VOICEOVER",
  "GENERATING_SCENES",
  "GENERATING_IMAGES",
  "QUEUED_FOR_RENDERING",
  "RENDERING",
  "UPLOADING_FINAL_VIDEO",
  "COMPLETED",
  "FAILED",
]);

// Status for each individual background task
export const taskStatusEnum = pgEnum("task_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

// The specific type of task from your 6-step list
export const taskTypeEnum = pgEnum("task_type", [
  "GENERATE_SCRIPT",
  "GENERATE_SCENES",
  "GENERATE_VOICEOVER",
  "GENERATE_IMAGES",
  "GENERATE_CAPTIONS",
  "STITCH_VIDEO",
]);

// --- EXISTING AUTH TABLES ---

// User table for Better Auth
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // Stripe integration
  stripeCustomerId: text("stripeCustomerId"),
  // Affiliate system
  stripeConnectAccountId: text("stripeConnectAccountId"),
  affiliateCode: text("affiliateCode").unique(),
  referredByCode: text("referredByCode"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Session table for Better Auth
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Account table for Better Auth (OAuth and credentials)
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Verification table for Better Auth (email verification, etc.)
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});


export const series = pgTable("series", {
  id: text("id").primaryKey(),
  theme: text("theme"), 

  artStyle: text("artStyle"), 
  voiceId: text("voiceId"), 
  captionHighlightColor: text("captionHighlightColor").default("#FFD700"),
  captionPosition: text("captionPosition").default("bottom"),
  emojiCaptions: boolean("emojiCaptions").default(false),
  
  schedule: text("schedule").default("daily"),
  isActive: boolean("isActive").default(true).notNull(), 

  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Represents a single video to be generated.
 * Tracks the overall job and stores the final assets.
 */
export const video = pgTable("video", {
  id: text("id").primaryKey(),
  theme: text("theme").notNull(),
  status: videoStatusEnum("status").default("PENDING").notNull(),

  // Video generation settings
  artStyle: text("artStyle"),
  captionHighlightColor: text("captionHighlightColor").default("#FFD700"), 
  captionPosition: text("captionPosition").default("bottom"), 
  emojiCaptions: boolean("emojiCaptions").default(false), 

  // Final generated assets
  title: text("title"),
  script: text("script"),
  voiceOverUrl: text("voiceOverUrl"),
  videoUrl: text("videoUrl"),
  captions_raw: jsonb("captions_raw"),
  captions_processed: jsonb("captions_processed"),

  // Foreign key to the user who created the video
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Optional foreign key to a series.
  // If this is NULL, it's a "one-off" video.
  seriesId: text("seriesId").references(() => series.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
});

/**
 * Represents one of the N scenes that make up a video.
 */
export const scene = pgTable("scene", {
  id: text("id").primaryKey(),
  sceneIndex: integer("sceneIndex").notNull(), // For ordering (0, 1, 2...)
  imagePrompt: text("imagePrompt"), // The prompt for the image generation
  imageUrl: text("imageUrl"), // The generated image for this scene

  // Foreign key to the video this scene belongs to
  videoId: text("videoId")
    .notNull()
    .references(() => video.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Tracks the status of an individual background task
 * (e.g., "GENERATE_SCRIPT") for a specific video.
 * Your Inngest functions will update these rows.
 */
export const task = pgTable("task", {
  id: text("id").primaryKey(),
  type: taskTypeEnum("type").notNull(),
  status: taskStatusEnum("status").default("PENDING").notNull(),
  error: text("error"), // To log any failure messages
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),

  // Foreign key to the video this task is for
  videoId: text("videoId")
    .notNull()
    .references(() => video.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Represents an AI-generated animated video
 */
export const aivideo = pgTable("aivideo", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  script: text("script"),
  style: text("style"), // Art style for the video
  status: videoStatusEnum("status").default("PENDING").notNull(),
  scenes: jsonb("scenes"), // JSONB array of scene objects
  finalUrl: text("finalUrl"), // URL to the final rendered video
  voiceOverUrl: text("voiceOverUrl"), // URL to the generated voiceover audio
  wordTimings: jsonb("wordTimings"), // Word-level timestamps from voiceover

  // Foreign key to the user who created the video
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// --- RELATIONS ---


// Relations for existing Auth tables
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session, {
    relationName: "userSessions",
  }),
  accounts: many(account, {
    relationName: "userAccounts",
  }),
  series: many(series, {
    relationName: "userSeries",
  }),
  videos: many(video, {
    relationName: "userVideos",
  }),
  aiVideos: many(aivideo, {
    relationName: "userAiVideos",
  }),
}));


export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
    relationName: "userSessions",
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
    relationName: "userAccounts",
  }),
}));

// Relations for the new Video tables
export const seriesRelations = relations(series, ({ one, many }) => ({
  user: one(user, {
    fields: [series.userId],
    references: [user.id],
    relationName: "userSeries",
  }),
  videos: many(video, {
    relationName: "seriesVideos",
  }),
}));

export const videoRelations = relations(video, ({ one, many }) => ({
  user: one(user, {
    fields: [video.userId],
    references: [user.id],
    relationName: "userVideos",
  }),
  series: one(series, {
    fields: [video.seriesId],
    references: [series.id],
    relationName: "seriesVideos",
  }),
  scenes: many(scene, {
    relationName: "videoScenes",
  }),
  tasks: many(task, {
    relationName: "videoTasks",
  }),
}));

export const sceneRelations = relations(scene, ({ one }) => ({
  video: one(video, {
    fields: [scene.videoId],
    references: [video.id],
    relationName: "videoScenes",
  }),
}));

export const taskRelations = relations(task, ({ one }) => ({
  video: one(video, {
    fields: [task.videoId],
    references: [video.id],
    relationName: "videoTasks",
  }),
}));

export const aivideoRelations = relations(aivideo, ({ one }) => ({
  user: one(user, {
    fields: [aivideo.userId],
    references: [user.id],
    relationName: "userAiVideos",
  }),
}));