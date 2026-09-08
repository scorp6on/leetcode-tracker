-- CreateEnum
CREATE TYPE "AttemptSource" AS ENUM ('MANUAL', 'IMPORTED');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "source" "AttemptSource" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "minutes" DROP NOT NULL,
ALTER COLUMN "confidence" DROP NOT NULL;
