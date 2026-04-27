-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN IF NOT EXISTS "permisos" JSONB DEFAULT '{}';

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupervisorVendedor" (
    "supervisorId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    CONSTRAINT "SupervisorVendedor_pkey" PRIMARY KEY ("supervisorId","vendedorId"),
    CONSTRAINT "SupervisorVendedor_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupervisorVendedor_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
