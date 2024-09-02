import { AsyncPipe, NgIf } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { BehaviorSubject, take, tap, timeout } from 'rxjs';
import { Web3ModalStateService } from './web3-modal-state.service';
import { Web3Modal } from '@web3modal/ethers';

const STORAGE_KEY = 'has-connected-wallet'

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [NgIf, AsyncPipe]
})
export class AppComponent implements OnInit {
  title = 'web3-test';

  private readonly web3ModalStateService = inject(Web3ModalStateService)


  public readonly isConnected$ = new BehaviorSubject<boolean>(this.hasConnectedWallet())

  public ngOnInit(): void {
    this.web3ModalStateService.getWalletInfo().pipe().subscribe(walletInfo => {
      console.log('walletInfo', walletInfo);

      if (walletInfo) {
        this.isConnected$.next(true);
        localStorage.setItem(STORAGE_KEY, 'true')
      }
    });

    setTimeout(() => {
      this.web3ModalStateService.web3ModalRef$.pipe(take(1)).subscribe(web3 => console.log('getWalletProvider', web3.getWalletProvider()))
    }, 5_000)
  }

  public connect(): void {
    this.web3ModalStateService.openModal('connect').pipe(take(1), tap((web3ModalRef) => this.updateConnectionState(web3ModalRef))).subscribe()
  }

  public signIn(): void {
    this.web3ModalStateService.doWeb3SignIn().pipe(take(1), tap((web3ModalRef) => this.updateConnectionState(web3ModalRef))).subscribe()
  }

  public disconnect(): void {
    this.web3ModalStateService.openModal('connect').pipe(take(1), tap((web3ModalRef) => this.updateConnectionState(web3ModalRef))).subscribe()
  }


  private hasConnectedWallet(): boolean {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  }

  private updateConnectionState(web3ModalRef: Web3Modal): void {
    const isConnected = web3ModalRef.getIsConnected();

    this.isConnected$.next(isConnected);
    localStorage.setItem(STORAGE_KEY, isConnected ? 'true' : 'false')
  }
}
