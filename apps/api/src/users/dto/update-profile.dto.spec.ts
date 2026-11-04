import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto.js';

describe('UpdateProfileDto', () => {
  describe('fullName', () => {
    it('should accept valid full name', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        fullName: 'John Doe',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject full name exceeding 100 characters', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        fullName: 'a'.repeat(101),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('fullName');
      expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });

    it('should reject non-string full name', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        fullName: 12345,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('fullName');
      expect(errors[0]?.constraints).toHaveProperty('isString');
    });
  });

  describe('bio', () => {
    it('should accept valid bio', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        bio: 'Software engineer with a passion for building great products.',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject bio exceeding 280 characters', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        bio: 'a'.repeat(281),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('bio');
      expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });

    it('should reject non-string bio', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        bio: 12345,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('bio');
      expect(errors[0]?.constraints).toHaveProperty('isString');
    });
  });

  describe('designation', () => {
    it('should accept valid designation', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        designation: 'Senior Developer',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject designation exceeding 100 characters', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        designation: 'a'.repeat(101),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('designation');
      expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });
  });

  describe('company', () => {
    it('should accept valid company', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        company: 'TechCorp Inc.',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject company exceeding 100 characters', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        company: 'a'.repeat(101),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('company');
      expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });
  });

  describe('phone', () => {
    it('should accept valid phone number', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        phone: '+1234567890',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-string phone', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        phone: 1234567890,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('phone');
      expect(errors[0]?.constraints).toHaveProperty('isString');
    });
  });

  describe('publicEmail', () => {
    it('should accept valid email', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        publicEmail: 'john@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid email format', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        publicEmail: 'not-an-email',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('publicEmail');
      expect(errors[0]?.constraints).toHaveProperty('isEmail');
    });
  });

  describe('hiddenFields', () => {
    it('should accept valid hiddenFields array', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        hiddenFields: ['phone', 'publicEmail'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept empty hiddenFields array', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        hiddenFields: [],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept single item in hiddenFields', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        hiddenFields: ['phone'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid values in hiddenFields', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        hiddenFields: ['phone', 'invalidField'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('hiddenFields');
      expect(errors[0]?.constraints).toHaveProperty('isIn');
    });

    it('should reject non-array hiddenFields', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        hiddenFields: 'phone',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('hiddenFields');
      expect(errors[0]?.constraints).toHaveProperty('isArray');
    });
  });

  describe('theme', () => {
    it('should accept "light" theme', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        theme: 'light',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept "dark" theme', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        theme: 'dark',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept "system" theme', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        theme: 'system',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid theme value', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        theme: 'invalid',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('theme');
      expect(errors[0]?.constraints).toHaveProperty('isEnum');
    });
  });

  describe('multiple fields', () => {
    it('should accept update with multiple valid fields', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        fullName: 'Jane Doe',
        bio: 'Product manager',
        designation: 'Senior PM',
        company: 'TechCorp',
        phone: '+9876543210',
        publicEmail: 'jane@example.com',
        hiddenFields: ['phone'],
        theme: 'dark',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept empty update object', async () => {
      const dto = plainToInstance(UpdateProfileDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
