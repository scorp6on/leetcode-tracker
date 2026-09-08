-- CreateTable
CREATE TABLE "predictions" (
    "id" SERIAL NOT NULL,
    "problem_id" INTEGER NOT NULL,
    "predicted_topic_slugs" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "hit" BOOLEAN,
    "matched_topic_slugs" TEXT[],

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "predictions_problem_id_resolved_at_idx" ON "predictions"("problem_id", "resolved_at");

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
