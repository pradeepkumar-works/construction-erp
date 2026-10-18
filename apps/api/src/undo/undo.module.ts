import { Module } from '@nestjs/common';
import { UndoController } from './undo.controller';

/** `POST /undo` (UX item 86); the service is in CommonModule, where each kind's own service registers itself. */
@Module({ controllers: [UndoController] })
export class UndoModule {}
