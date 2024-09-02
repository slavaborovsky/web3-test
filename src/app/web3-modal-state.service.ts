import {Injectable} from '@angular/core';

import {
  concatMap,
  first,
  from,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs';



import type {Web3Modal} from '@web3modal/ethers';
import type {ConnectedWalletInfo} from '@web3modal/scaffold';

type TWeb3ModalOpenState = 'connect' | 'disconnect';

const WEB3_MODAL_INIT_TIMEOUT_MS = 60_000;

@Injectable({providedIn: 'root'})
export class Web3ModalStateService {
  public static readonly PROJECT_ID = ''; // replace with your PROJECT_ID
  public static readonly CHAIN_ID = 1; // Magic number for Ethereum

  public readonly web3ModalRef$ = this.buildWeb3Modal().pipe(shareReplay(1));

  public openModal(state: TWeb3ModalOpenState): Observable<Web3Modal> {
    return this.web3ModalRef$.pipe(
      first(),
      switchMap(web3ModalRef => {
        console.log(state, web3ModalRef.getIsConnected());

        if (state === 'connect' && web3ModalRef.getIsConnected()) {
          return web3ModalRef.disconnect().then(() => web3ModalRef);
        }

        return of(web3ModalRef);
      }),
      switchMap(web3ModalRef => {
        if (state === 'disconnect' && !web3ModalRef.getIsConnected()) {
          return of(web3ModalRef);
        }

        return from(web3ModalRef.open()).pipe(
          concatMap(
            () =>
              /**
               * For providers like Metamask and TrustWallet, web3Modal fires 'MODAL_CLOSE' event
               * whereas for providers like Brave Wallet (browser extension), only `CONNECT_SUCCESS` fires.
               *
               * Additionally, during `CONNECT_SUCCESS` event, wallet info is not available right away in opposite to `MODAL_CLOSE` event.
               * One way to handle `CONNECT_SUCCESS` is to subscribe to wallet info until it exists (connected) or misses (disconnected).
               * so that if web3Modal ever fires different events for others providers (> 400 providers)
               * we likely don't have to modify this code.
               */
              new Observable<Web3Modal>(subscriber => {
                let hasConnectSuccessCalled = false;

                web3ModalRef.subscribeEvents(event => {
                  console.log('subscribeEvents', event.data.event)
                  if (subscriber.closed) {
                    return;
                  }

                  hasConnectSuccessCalled = event.data.event === 'CONNECT_SUCCESS';

                  if (event.data.event === 'MODAL_CLOSE') {
                    subscriber.next(web3ModalRef);
                    subscriber.complete();
                  }
                });

                web3ModalRef.subscribeWalletInfo(walletInfo => {
                  console.log('subscribeWalletInfo', walletInfo)
                  if (subscriber.closed) {
                    return;
                  }

                  if (
                    (state === 'connect' && walletInfo && hasConnectSuccessCalled) ||
                    (state === 'disconnect' && !walletInfo)
                  ) {
                    subscriber.next(web3ModalRef);
                    subscriber.complete();
                  }
                });

                return () => {
                  subscriber.unsubscribe();
                };
              }),
          ),
        );
      }),
    );
  }

  public getWalletInfo(): Observable<NonNullable<ConnectedWalletInfo>> {
    return this.web3ModalRef$.pipe(
      first(),
      switchMap(web3ModalRef => {
        const walletInfo = web3ModalRef.getWalletInfo();

        if (walletInfo) {
          return of(walletInfo);
        }

        return new Observable<NonNullable<ConnectedWalletInfo>>(subscriber => {
          web3ModalRef.subscribeWalletInfo(walletInfoUpdate => {
            if (subscriber.closed) {
              return;
            }

            if (walletInfoUpdate) {
              subscriber.next(walletInfoUpdate);
              subscriber.complete();
            }
          });

          return () => {
            subscriber.unsubscribe();
          };
        });
      }),
    );
  }

  public waitIfNeededForNetworkSwitchOrModalClose(web3ModalRef: Web3Modal): Observable<boolean> {
    if (web3ModalRef.getChainId() === Web3ModalStateService.CHAIN_ID) {
      return of(true);
    }

    return new Observable<boolean>(subscriber => {
      web3ModalRef.subscribeState(state => {
        if (subscriber.closed) {
          return;
        }

        if (state.selectedNetworkId === Web3ModalStateService.CHAIN_ID) {
          subscriber.next(true);
          subscriber.complete();
        }
      });

      web3ModalRef.subscribeEvents(event => {
        if (subscriber.closed) {
          return;
        }

        if (event.data.event === 'MODAL_CLOSE') {
          subscriber.next(web3ModalRef.getChainId() === Web3ModalStateService.CHAIN_ID);
          subscriber.complete();
        }
      });

      return () => {
        subscriber.unsubscribe();
      };
    });
  }

  public doWeb3SignIn(): Observable<Web3Modal> {
    return this.getWalletInfo().pipe(
      timeout(WEB3_MODAL_INIT_TIMEOUT_MS),
      withLatestFrom(this.web3ModalRef$),
      tap((data) => console.log('data: ', data)),
      map(data => data[1])
    );
  }

  private buildWeb3Modal(): Observable<Web3Modal> {
    return from(import('@web3modal/ethers')).pipe(
      map(({createWeb3Modal, defaultConfig}) => {
        const mainnet = {
          chainId: Web3ModalStateService.CHAIN_ID,
          name: 'Ethereum',
          currency: 'ETH',
          explorerUrl: 'https://etherscan.io',
          rpcUrl: 'https://cloudflare-eth.com',
        };
        const metadata = {
          name: 'Web3 Test',
          description: 'Web3 test application',
          url: 'https://localhost:4300',
          icons: [],
        };
        const ethersConfig = defaultConfig({
          metadata,
        });

        return createWeb3Modal({
          ethersConfig,
          chains: [mainnet],
          defaultChain: mainnet,
          projectId: Web3ModalStateService.PROJECT_ID,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          allowUnsupportedChain: false,
        });
      }),
    );
  }


}
