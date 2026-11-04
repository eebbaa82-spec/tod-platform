import { Global, Module } from '@nestjs/common';
import { config } from '../common/config';
import { EscrowGateway, ESCROW_PROVIDER, TestEscrowProvider } from './escrow';
import { LENDER_CONNECTOR, LenderGateway, TestLenderConnector } from './lender';
import { IDENTITY_PROVIDER, IdentityResultService, PendingIdentityProvider } from './identity';
import { PublicationService } from './publication';
import { VettingOutcomeService } from './vetting';

// Swap the providers below for the developer's real implementations.
@Global()
@Module({
  providers: [
    { provide: IDENTITY_PROVIDER, useClass: PendingIdentityProvider },
    {
      provide: ESCROW_PROVIDER,
      useFactory: () => {
        if (config.isProduction) {
          throw new Error('No escrow provider configured. The test stand-in cannot run in production.');
        }
        return new TestEscrowProvider();
      },
    },
    {
      provide: LENDER_CONNECTOR,
      useFactory: () => {
        if (config.isProduction) {
          throw new Error('No pay-later lender configured. The test stand-in cannot run in production.');
        }
        return new TestLenderConnector();
      },
    },
    EscrowGateway,
    LenderGateway,
    IdentityResultService,
    VettingOutcomeService,
    PublicationService,
  ],
  exports: [IDENTITY_PROVIDER, ESCROW_PROVIDER, LENDER_CONNECTOR, EscrowGateway, LenderGateway, IdentityResultService, VettingOutcomeService, PublicationService],
})
export class IntegrationsModule {}
