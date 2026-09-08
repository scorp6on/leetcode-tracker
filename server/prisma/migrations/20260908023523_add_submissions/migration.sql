-- CreateTable
CREATE TABLE "submissions" (
    "lc_submission_id" TEXT NOT NULL,
    "problem_id" INTEGER,
    "title_slug" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "status_display" TEXT NOT NULL,
    "is_accepted" BOOLEAN NOT NULL,
    "runtime" TEXT,
    "memory" TEXT,
    "code" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("lc_submission_id")
);

-- CreateIndex
CREATE INDEX "submissions_problem_id_idx" ON "submissions"("problem_id");

-- CreateIndex
CREATE INDEX "submissions_title_slug_idx" ON "submissions"("title_slug");

-- CreateIndex
CREATE INDEX "submissions_submitted_at_idx" ON "submissions"("submitted_at");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
