-- CreateTable
CREATE TABLE "problem_failure_modes" (
    "problem_id" INTEGER NOT NULL,
    "failure_mode" "FailureMode" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_failure_modes_pkey" PRIMARY KEY ("problem_id","failure_mode")
);

-- CreateIndex
CREATE INDEX "problem_failure_modes_failure_mode_idx" ON "problem_failure_modes"("failure_mode");

-- AddForeignKey
ALTER TABLE "problem_failure_modes" ADD CONSTRAINT "problem_failure_modes_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
