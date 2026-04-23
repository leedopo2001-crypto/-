-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT,
    "amount" INTEGER NOT NULL,
    "orderName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentKey" TEXT,
    "failCode" TEXT,
    "failMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
