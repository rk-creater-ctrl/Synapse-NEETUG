import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ApproveDeviceDto, LoginDto, RefreshDto, RegisterDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @HttpCode(200)
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @HttpCode(200)
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.service.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post('logout')
  logout(@Req() request: any, @Body() dto?: RefreshDto) {
    return this.service.logout(request.user.id, dto?.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  devices(@Req() request: any) {
    return this.service.listDevices(request.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('devices/:deviceId/approve')
  @Throttle({ default: { limit: 8, ttl: 600_000 } })
  approveDevice(@Req() request: any, @Param('deviceId') deviceId: string, @Body() dto: ApproveDeviceDto) {
    return this.service.approveDevice(request.user.id, request.user.deviceId, deviceId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post('devices/:deviceId/revoke')
  revokeDevice(@Req() request: any, @Param('deviceId') deviceId: string) {
    return this.service.revokeDevice(request.user.id, deviceId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: any) {
    return this.service.me(request.user.id);
  }
}
