-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('BASE', 'ALLOWANCE', 'BONUS', 'DEDUCTION');

-- CreateTable
CREATE TABLE "SalaryRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "salaryRecordId" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryRecord_effectiveDate_idx" ON "SalaryRecord"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryRecord_employeeId_effectiveDate_key" ON "SalaryRecord"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_salaryRecordId_type_name_key" ON "SalaryComponent"("salaryRecordId", "type", "name");

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "SalaryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_amount_nonneg" CHECK ("amount" >= 0);
CREATE UNIQUE INDEX "SalaryComponent_one_base_per_record" ON "SalaryComponent" ("salaryRecordId") WHERE "type" = 'BASE';
