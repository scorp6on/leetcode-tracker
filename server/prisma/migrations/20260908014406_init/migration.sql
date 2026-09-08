-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('SOLVED', 'STRUGGLED', 'FAILED');

-- CreateEnum
CREATE TYPE "FailureMode" AS ENUM ('OFF_BY_ONE', 'MISSED_EDGE_CASE', 'WRONG_COMPLEXITY', 'MISREAD_CONSTRAINTS', 'WRONG_APPROACH', 'SYNTAX_ERROR', 'RAN_OUT_OF_TIME');

-- CreateTable
CREATE TABLE "problems" (
    "id" SERIAL NOT NULL,
    "lc_frontend_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "url" TEXT NOT NULL,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" SERIAL NOT NULL,
    "problem_id" INTEGER NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "Outcome" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "failure_mode" "FailureMode",
    "notes" TEXT,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_schedule" (
    "problem_id" INTEGER NOT NULL,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "next_review_date" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_schedule_pkey" PRIMARY KEY ("problem_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problems_lc_frontend_id_key" ON "problems"("lc_frontend_id");

-- CreateIndex
CREATE UNIQUE INDEX "problems_slug_key" ON "problems"("slug");

-- CreateIndex
CREATE INDEX "attempts_problem_id_idx" ON "attempts"("problem_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedule" ADD CONSTRAINT "review_schedule_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
