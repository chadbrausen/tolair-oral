import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompassService } from './compass.service';
import { CompassController } from './compass.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CompassController],
  providers: [CompassService],
  exports: [CompassService],
})
export class CompassModule {}
