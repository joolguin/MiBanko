import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ImportScreen } from './ImportScreen'
import { parseBiceVisaCsv } from '../../parsers/biceVisaCsv'
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useImportPreview } from '../../data/useImportPreview'
import { useImportTransactions } from '../../data/useImportTransactions'

vi.mock('../../parsers/biceVisaCsv')
vi.mock('../../data/useAccounts')
vi.mock('../../data/useCategories')
vi.mock('../../data/useImportPreview')
vi.mock('../../data/useImportTransactions')

const mutate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccounts).mockReturnValue({ data: [{ id: 'acc-bice', name: 'BICE Visa Gold', type: 'credit', bank: 'BICE' }] } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [{ id: 'cat-transporte', name: 'Transporte' }] } as any)
  vi.mocked(useImportPreview).mockReturnValue({ data: [] } as any)
  vi.mocked(useImportTransactions).mockReturnValue({ mutate, isPending: false, isError: false } as any)
  vi.mocked(parseBiceVisaCsv).mockResolvedValue([
    { date: '2026-07-10', amount: 5500, description: 'Google Play', kind: 'gasto', bankCategory: 'Autos Y Transporte' },
  ])
})

function renderScreen() {
  return render(<MemoryRouter><ImportScreen /></MemoryRouter>)
}

describe('ImportScreen', () => {
  it('should_ShowPreview_When_FileParsed', async () => {
    renderScreen()

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText(/archivo/i), file)

    expect(await screen.findByText('Google Play')).toBeInTheDocument()
  })

  it('should_ImportSelectedRows_When_Confirmed', async () => {
    const user = userEvent.setup()
    renderScreen()

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), file)
    await screen.findByText('Google Play')
    await user.click(screen.getByRole('button', { name: /importar/i }))

    await waitFor(() => expect(mutate).toHaveBeenCalled())
    const payload = mutate.mock.calls[0][0]
    expect(payload.accountId).toBe('acc-bice')
    expect(payload.billingCycleId).toBeNull()
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({ amount: 5500, categoryId: 'cat-transporte' })
  })

  it('should_KeepUserUnselect_When_PreviewDataRefetchesWithNewReference', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MemoryRouter><ImportScreen /></MemoryRouter>)

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), file)
    await screen.findByText('Google Play')

    // Checkboxes: [0] = "Marcar todas", [1] = the Google Play row.
    const rowCheckbox = screen.getAllByRole('checkbox')[1]
    await user.click(rowCheckbox)
    expect(rowCheckbox).not.toBeChecked()

    // Simulate react-query refetch on window focus: same content, new array reference.
    vi.mocked(useImportPreview).mockReturnValue({ data: [], isLoading: false } as any)
    rerender(<MemoryRouter><ImportScreen /></MemoryRouter>)

    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked()
  })

  it('should_ClearStalePreview_When_SecondFileFailsToParse', async () => {
    const user = userEvent.setup()
    renderScreen()

    const goodFile = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), goodFile)
    await screen.findByText('Google Play')
    expect(screen.getByRole('button', { name: /importar/i })).toBeInTheDocument()

    vi.mocked(parseBiceVisaCsv).mockRejectedValueOnce(new Error('bad file'))
    const badFile = new File(['y'], 'otra.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), badFile)

    await screen.findByText(/no se pudo leer el archivo/i)
    expect(screen.queryByText('Google Play')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importar/i })).not.toBeInTheDocument()
  })

  it('should_ShowNoMovementsMessage_When_ParserReturnsEmptyArray', async () => {
    const user = userEvent.setup()
    vi.mocked(parseBiceVisaCsv).mockResolvedValue([])
    renderScreen()

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), file)

    await screen.findByText(/no se reconocieron movimientos/i)
    expect(screen.queryByText('Google Play')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importar/i })).not.toBeInTheDocument()
  })
})
