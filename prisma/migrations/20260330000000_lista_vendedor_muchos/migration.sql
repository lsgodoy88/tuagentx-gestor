-- CreateTable
CREATE TABLE "EmpleadoLista" (
    "empleadoId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    CONSTRAINT "EmpleadoLista_pkey" PRIMARY KEY ("empleadoId","listaId")
);

-- AddForeignKey
ALTER TABLE "EmpleadoLista" ADD CONSTRAINT "EmpleadoLista_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpleadoLista" ADD CONSTRAINT "EmpleadoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "ListaClientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ListaClientes" DROP COLUMN "empleadoId";

-- AlterTable
ALTER TABLE "Cliente" DROP COLUMN "vendedorId";
