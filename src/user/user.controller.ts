import { Controller } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  // The old /user/login endpoint has been removed.
  // All authentication now goes through /auth/login for consistency.
}
