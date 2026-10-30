-- Face attendance: the photo the phone takes as a person marks in and as they mark out
ALTER TABLE "StaffAttendance" ADD COLUMN     "checkInPhotoId" TEXT,
ADD COLUMN     "checkOutPhotoId" TEXT;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_checkInPhotoId_fkey" FOREIGN KEY ("checkInPhotoId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_checkOutPhotoId_fkey" FOREIGN KEY ("checkOutPhotoId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
