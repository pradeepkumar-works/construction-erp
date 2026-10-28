'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowLeftRightIcon,
  Building2Icon,
  ArrowLeftIcon,
  MergeIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BadgeIndianRupeeIcon,
  BanIcon,
  BellIcon,
  BookIcon,
  BookTextIcon,
  CalculatorIcon,
  CameraIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CarIcon,
  ChartAreaIcon,
  ChartLineIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleCheckBigIcon,
  CircleHelpIcon,
  CirclePlayIcon,
  ClipboardCheckIcon,
  ClockIcon,
  CloudIcon,
  CoffeeIcon,
  CompassIcon,
  ContactIcon,
  CopyIcon,
  CornerUpLeftIcon,
  CreditCardIcon,
  CrosshairIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FileCheckIcon,
  FileImageIcon,
  FileLockIcon,
  FilePlusIcon,
  FileSearchIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FlagIcon,
  FlaskConicalIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  FunnelIcon,
  GiftIcon,
  HardHatIcon,
  HashIcon,
  HeadsetIcon,
  HighlighterIcon,
  HistoryIcon,
  HourglassIcon,
  ImportIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  LoaderCircleIcon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  MailIcon,
  Maximize2Icon,
  MenuIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  MessageSquareTextIcon,
  MinusIcon,
  MoveIcon,
  MoveHorizontalIcon,
  PaletteIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PaperclipIcon,
  PencilIcon,
  PercentIcon,
  PlusIcon,
  PresentationIcon,
  PrinterIcon,
  Redo2Icon,
  RefreshCwIcon,
  RotateCwIcon,
  Rows3Icon,
  SaveIcon,
  ScaleIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  SirenIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  SquareArrowOutUpRightIcon,
  SquareCheckIcon,
  SquareDashedIcon,
  StoreIcon,
  TableIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  TrendingUpIcon,
  TriangleAlertIcon,
  TrophyIcon,
  TruckIcon,
  TypeIcon,
  Undo2Icon,
  UnfoldVerticalIcon,
  UnlinkIcon,
  UploadIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';

/**
 * The web app's icons: Lucide, drawn at 1em with a 2 px stroke like the navigation tree's (`shell/nav-icons.tsx`), under the
 * Ant Design names the pages already use, so `import { PlusOutlined } from '@/components/common/icons'` is the whole change
 * from `@ant-design/icons` (ESLint stops imports from there). Each sits in a `span.anticon`, so antd's buttons, menus and
 * inputs space and colour it as their own, and like antd's it is `role="img"` with its name as the label unless it is given
 * `aria-hidden` or a label of its own. A new icon is one line below, under an antd-style name.
 */
export interface AppIconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Turn it continuously (a loading mark). */
  spin?: boolean;
  /** Degrees to turn it by. */
  rotate?: number;
}

export type AppIcon = React.ForwardRefExoticComponent<AppIconProps & React.RefAttributes<HTMLSpanElement>>;

function frame(name: string, glyph: (props: { size: string; 'aria-hidden': true; focusable: false }) => React.ReactNode, spinByDefault = false): AppIcon {
  const Icon = React.forwardRef<HTMLSpanElement, AppIconProps>(function Icon({ spin = spinByDefault, rotate, className, style, ...rest }, ref) {
    const labelled = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
    const hidden = rest['aria-hidden'] === true || rest['aria-hidden'] === 'true';
    return (
      <span
        ref={ref}
        role={hidden ? undefined : 'img'}
        aria-label={hidden || labelled ? undefined : name}
        {...rest}
        className={['anticon', `anticon-${name}`, spin ? 'app-icon-spin' : '', className].filter(Boolean).join(' ')}
        style={rotate ? { ...style, transform: `rotate(${rotate}deg)` } : style}
      >
        {glyph({ size: '1em', 'aria-hidden': true, focusable: false })}
      </span>
    );
  });
  Icon.displayName = name;
  return Icon;
}

const lucide = (Lucide: LucideIcon, name: string, spin = false) => frame(name, (p) => <Lucide {...p} strokeWidth={2} />, spin);

/** A Lucide shape filled in (a chosen thumbs up). */
const solid = (Lucide: LucideIcon, name: string) => frame(name, (p) => <Lucide {...p} strokeWidth={2} fill="currentColor" />);

/** A filled disc with its mark cut out of it, so the mark shows whatever is behind (a status on a tinted fill). */
function SolidCircle({ marks }: { marks: string[] }) {
  const id = `app-icon-${React.useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden focusable="false">
      <mask id={id}>
        <rect width="24" height="24" fill="#fff" />
        {marks.map((d) => (
          <path key={d} d={d} fill="none" stroke="#000" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </mask>
      <circle cx="12" cy="12" r="10.5" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
const disc = (name: string, marks: string[]) => frame(name, () => <SolidCircle marks={marks} />);

/** An icon of the app's own drawing (an SVG at 1em in `currentColor`), framed like the rest. */
export const ownIcon = (name: string, Svg: React.ComponentType) => frame(name, () => <Svg />);

export const AccountBookOutlined = lucide(BookTextIcon, 'account-book');
export const AimOutlined = lucide(CrosshairIcon, 'aim');
export const AlertOutlined = lucide(SirenIcon, 'alert');
export const AppstoreAddOutlined = lucide(LayoutGridIcon, 'appstore-add');
export const AppstoreOutlined = lucide(LayoutGridIcon, 'appstore');
export const ArrowDownOutlined = lucide(ArrowDownIcon, 'arrow-down');
export const ArrowLeftOutlined = lucide(ArrowLeftIcon, 'arrow-left');
export const ArrowRightOutlined = lucide(ArrowRightIcon, 'arrow-right');
export const ArrowUpOutlined = lucide(ArrowUpIcon, 'arrow-up');
export const AuditOutlined = lucide(ClipboardCheckIcon, 'audit');
export const BankOutlined = lucide(LandmarkIcon, 'bank');
/** A company (group companies) */
export const BuildOutlined = lucide(Building2Icon, 'build');
export const BellOutlined = lucide(BellIcon, 'bell');
export const BgColorsOutlined = lucide(PaletteIcon, 'bg-colors');
export const BookOutlined = lucide(BookIcon, 'book');
export const BorderOuterOutlined = lucide(SquareDashedIcon, 'border-outer');
export const BorderOutlined = lucide(SquareIcon, 'border');
export const CalculatorOutlined = lucide(CalculatorIcon, 'calculator');
export const CameraOutlined = lucide(CameraIcon, 'camera');
export const CarOutlined = lucide(CarIcon, 'car');
export const CaretDownOutlined = lucide(ChevronDownIcon, 'caret-down');
export const CaretRightOutlined = lucide(ChevronRightIcon, 'caret-right');
export const CarryOutOutlined = lucide(CalendarCheckIcon, 'carry-out');
export const CheckCircleFilled = disc('check-circle', ['m7.5 12.5 3 3 6-6.5']);
export const CheckCircleOutlined = lucide(CircleCheckIcon, 'check-circle');
export const CheckOutlined = lucide(CheckIcon, 'check');
export const CheckSquareOutlined = lucide(SquareCheckIcon, 'check-square');
export const ClearOutlined = lucide(EraserIcon, 'clear');
export const ClockCircleOutlined = lucide(ClockIcon, 'clock-circle');
export const CloseCircleFilled = disc('close-circle', ['m9 9 6 6', 'm15 9-6 6']);
export const CloseOutlined = lucide(XIcon, 'close');
export const CloudOutlined = lucide(CloudIcon, 'cloud');
export const CoffeeOutlined = lucide(CoffeeIcon, 'coffee');
export const ColumnHeightOutlined = lucide(UnfoldVerticalIcon, 'column-height');
export const ColumnWidthOutlined = lucide(MoveHorizontalIcon, 'column-width');
export const CommentOutlined = lucide(MessageSquareTextIcon, 'comment');
export const CompassOutlined = lucide(CompassIcon, 'compass');
export const ContactsOutlined = lucide(ContactIcon, 'contacts');
export const ContainerOutlined = lucide(ArchiveIcon, 'container');
export const CopyOutlined = lucide(CopyIcon, 'copy');
export const CreditCardOutlined = lucide(CreditCardIcon, 'credit-card');
export const CustomerServiceOutlined = lucide(HeadsetIcon, 'customer-service');
export const DeleteOutlined = lucide(Trash2Icon, 'delete');
export const DisconnectOutlined = lucide(UnlinkIcon, 'disconnect');
export const DislikeFilled = solid(ThumbsDownIcon, 'dislike');
export const DislikeOutlined = lucide(ThumbsDownIcon, 'dislike');
export const DownOutlined = lucide(ChevronDownIcon, 'down');
export const DownloadOutlined = lucide(DownloadIcon, 'download');
export const DragOutlined = lucide(MoveIcon, 'drag');
export const EditOutlined = lucide(PencilIcon, 'edit');
export const EllipsisOutlined = lucide(EllipsisIcon, 'ellipsis');
export const ExclamationCircleFilled = disc('exclamation-circle', ['M12 7v6', 'M12 16.75h.01']);
export const ExclamationCircleOutlined = lucide(CircleAlertIcon, 'exclamation-circle');
export const ExpandOutlined = lucide(Maximize2Icon, 'expand');
export const ExperimentOutlined = lucide(FlaskConicalIcon, 'experiment');
export const ExportOutlined = lucide(SquareArrowOutUpRightIcon, 'export');
export const EyeInvisibleOutlined = lucide(EyeOffIcon, 'eye-invisible');
export const EyeOutlined = lucide(EyeIcon, 'eye');
export const FileAddOutlined = lucide(FilePlusIcon, 'file-add');
export const FileDoneOutlined = lucide(FileCheckIcon, 'file-done');
export const FileExcelOutlined = lucide(FileSpreadsheetIcon, 'file-excel');
export const FileImageOutlined = lucide(FileImageIcon, 'file-image');
export const FileOutlined = lucide(FileIcon, 'file');
export const FilePdfOutlined = lucide(FileTextIcon, 'file-pdf');
export const FileProtectOutlined = lucide(FileLockIcon, 'file-protect');
export const FileSearchOutlined = lucide(FileSearchIcon, 'file-search');
export const FileTextOutlined = lucide(FileTextIcon, 'file-text');
export const FilterOutlined = lucide(FunnelIcon, 'filter');
export const FlagOutlined = lucide(FlagIcon, 'flag');
export const FolderOpenOutlined = lucide(FolderOpenIcon, 'folder-open');
export const FontSizeOutlined = lucide(TypeIcon, 'font-size');
export const FundOutlined = lucide(ChartAreaIcon, 'fund');
export const FundProjectionScreenOutlined = lucide(PresentationIcon, 'fund-projection-screen');
export const GiftOutlined = lucide(GiftIcon, 'gift');
export const HighlightOutlined = lucide(HighlighterIcon, 'highlight');
export const HistoryOutlined = lucide(HistoryIcon, 'history');
export const HourglassOutlined = lucide(HourglassIcon, 'hourglass');
export const ImportOutlined = lucide(ImportIcon, 'import');
export const InboxOutlined = lucide(InboxIcon, 'inbox');
export const IssuesCloseOutlined = lucide(CircleCheckBigIcon, 'issues-close');
export const LeftOutlined = lucide(ChevronLeftIcon, 'left');
export const LikeFilled = solid(ThumbsUpIcon, 'like');
export const LikeOutlined = lucide(ThumbsUpIcon, 'like');
export const LineChartOutlined = lucide(ChartLineIcon, 'line-chart');
export const LineHeightOutlined = lucide(Rows3Icon, 'line-height');
export const LineOutlined = lucide(MinusIcon, 'line');
export const LinkOutlined = lucide(LinkIcon, 'link');
export const LoadingOutlined = lucide(LoaderCircleIcon, 'loading', true);
export const LockOutlined = lucide(LockIcon, 'lock');
export const LoginOutlined = lucide(LogInIcon, 'login');
export const LogoutOutlined = lucide(LogOutIcon, 'logout');
export const MailOutlined = lucide(MailIcon, 'mail');
export const MenuFoldOutlined = lucide(PanelLeftCloseIcon, 'menu-fold');
export const MenuOutlined = lucide(MenuIcon, 'menu');
export const MenuUnfoldOutlined = lucide(PanelLeftOpenIcon, 'menu-unfold');
export const MergeCellsOutlined = lucide(MergeIcon, 'merge-cells');
export const MessageOutlined = lucide(MessageSquareIcon, 'message');
export const MoreOutlined = lucide(EllipsisVerticalIcon, 'more');
export const NumberOutlined = lucide(HashIcon, 'number');
export const PaperClipOutlined = lucide(PaperclipIcon, 'paper-clip');
export const PayCircleOutlined = lucide(BadgeIndianRupeeIcon, 'pay-circle');
export const PercentageOutlined = lucide(PercentIcon, 'percentage');
export const PlayCircleOutlined = lucide(CirclePlayIcon, 'play-circle');
export const PlusOutlined = lucide(PlusIcon, 'plus');
export const PrinterOutlined = lucide(PrinterIcon, 'printer');
export const ProjectOutlined = lucide(FolderKanbanIcon, 'project');
export const QuestionCircleOutlined = lucide(CircleHelpIcon, 'question-circle');
export const ReconciliationOutlined = lucide(ScaleIcon, 'reconciliation');
export const RedoOutlined = lucide(Redo2Icon, 'redo');
export const ReloadOutlined = lucide(RotateCwIcon, 'reload');
export const RightOutlined = lucide(ChevronRightIcon, 'right');
export const RiseOutlined = lucide(TrendingUpIcon, 'rise');
export const RollbackOutlined = lucide(CornerUpLeftIcon, 'rollback');
export const SafetyCertificateOutlined = lucide(ShieldCheckIcon, 'safety-certificate');
export const SafetyOutlined = lucide(ShieldIcon, 'safety');
export const SaveOutlined = lucide(SaveIcon, 'save');
export const ScheduleOutlined = lucide(CalendarClockIcon, 'schedule');
export const SearchOutlined = lucide(SearchIcon, 'search');
export const SendOutlined = lucide(SendIcon, 'send');
export const SettingOutlined = lucide(SettingsIcon, 'setting');
export const SwapOutlined = lucide(ArrowLeftRightIcon, 'swap');
export const ShopOutlined = lucide(StoreIcon, 'shop');
export const ShoppingCartOutlined = lucide(ShoppingCartIcon, 'shopping-cart');
export const SlidersOutlined = lucide(SlidersHorizontalIcon, 'sliders');
export const SolutionOutlined = lucide(HardHatIcon, 'solution');
export const StopOutlined = lucide(BanIcon, 'stop');
export const SyncOutlined = lucide(RefreshCwIcon, 'sync');
export const TableOutlined = lucide(TableIcon, 'table');
export const TeamOutlined = lucide(UsersIcon, 'team');
export const ThunderboltOutlined = lucide(ZapIcon, 'thunderbolt');
export const ToolOutlined = lucide(WrenchIcon, 'tool');
export const TrophyOutlined = lucide(TrophyIcon, 'trophy');
export const TruckOutlined = lucide(TruckIcon, 'truck');
export const UndoOutlined = lucide(Undo2Icon, 'undo');
export const UnorderedListOutlined = lucide(ListIcon, 'unordered-list');
export const UpOutlined = lucide(ChevronUpIcon, 'up');
export const UploadOutlined = lucide(UploadIcon, 'upload');
export const UserAddOutlined = lucide(UserPlusIcon, 'user-add');
export const UserDeleteOutlined = lucide(UserMinusIcon, 'user-delete');
export const UserOutlined = lucide(UserIcon, 'user');
export const WalletOutlined = lucide(WalletIcon, 'wallet');
export const WarningOutlined = lucide(TriangleAlertIcon, 'warning');
export const WhatsAppOutlined = lucide(MessageCircleIcon, 'whats-app');
export const ZoomInOutlined = lucide(ZoomInIcon, 'zoom-in');
export const ZoomOutOutlined = lucide(ZoomOutIcon, 'zoom-out');
