import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

@ValidatorConstraint({ name: 'isNotFutureYear', async: false })
export class IsNotFutureYearConstraint implements ValidatorConstraintInterface {
  validate(year: number, args: ValidationArguments) {
    if (!year) return true; // Allow empty/null values
    const currentYear = new Date().getFullYear();
    return year <= currentYear;
  }

  defaultMessage(args: ValidationArguments) {
    const currentYear = new Date().getFullYear();
    return `Year cannot be in the future. Current year is ${currentYear}`;
  }
}

export function IsNotFutureYear(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotFutureYearConstraint,
    });
  };
}
