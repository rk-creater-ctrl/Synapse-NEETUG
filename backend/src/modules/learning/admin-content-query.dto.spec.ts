import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminVideoListDto } from './dto';
import { AdminFlashcardListDto } from '../flashcards/flashcards.dto';

describe('admin content list query DTOs', () => {
  it.each([
    ['videos', AdminVideoListDto],
    ['flashcards', AdminFlashcardListDto],
  ])('rejects an unsafe page size for %s', async (_resource, Dto) => {
    const dto = plainToInstance(Dto, { page: '0', limit: '101' });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
  });
});
